# Segurança do login: verificação em duas etapas e captcha

Dois reforços opcionais da entrada no sistema, ambos do próprio Supabase Auth:

- **Verificação em duas etapas (MFA TOTP):** além da senha (ou do Google), a entrada pede o
  código de 6 números de um app autenticador do celular. Cada conta liga a sua.
- **Captcha (Cloudflare Turnstile):** login, cadastro, recuperação de senha, reenvio da
  confirmação e a troca de senha em Configurações passam por uma verificação contra robôs.
  Liga para o sistema inteiro, por variável de ambiente.

## Verificação em duas etapas (MFA TOTP)

### Para quem usa

1. **Configurações → Conta e negócio → Verificação em duas etapas → Ativar.**
2. No app autenticador (Google Authenticator, Microsoft Authenticator, 1Password, Authy…),
   adicionar conta e ler o QR Code. Sem câmera (ou no próprio celular), digitar o código
   mostrado abaixo do QR, ou tocar em "Abrir no app autenticador".
3. Digitar o código de 6 números que o app mostrar e **Confirmar e ativar**.

Daí em diante, depois da senha (ou do Google) vem a tela `/auth/mfa`, que pede o código. As
sessões que a conta tinha abertas em outros aparelhos sem o código são encerradas pelo
Supabase na ativação.

Para desativar: o mesmo cartão, **Desativar**, com o código atual do app. Trocar a senha em
Configurações também pede o código (a GoTrue recusa troca de senha sem a segunda etapa).

### Pré-requisito no Supabase

**Authentication → Multi-Factor** (ou *Sign In / Providers → Multi-Factor Authentication*):
"TOTP (App Authenticator)" precisa estar habilitado. Nos projetos hospedados ele já vem
ligado; se estiver desligado, o cartão mostra "A verificação em duas etapas está desligada
neste sistema."

### Onde cada trava mora

| O quê | Onde | Observação |
| --- | --- | --- |
| Mandar para `/auth/mfa` quem tem fator e entrou só com a senha | `lib/supabase/middleware.ts` + `lib/rotas-auth.ts` | **Roteamento.** A lista de fatores vem do cookie da sessão, que o dono do navegador consegue editar |
| Conferir o código | GoTrue (`/factors/:id/verify`) | Limite de tentativas por IP — por isso o código da entrada vai do navegador, não de Server Action |
| Trocar senha, e-mail ou desativar fator com fator ativo | GoTrue (exige sessão `aal2`) | `insufficient_aal` → "Confirme o código do app autenticador…" |
| Ler/gravar dados com sessão `aal1` de conta com fator | **Ainda não existe** | Ver "Pendente" abaixo |

### Pendente: a trava no banco

Pela regra do projeto (*se a checagem só existe no servidor do app, ela não existe*), o MFA só
fica completo quando o banco também recusar a sessão `aal1` de quem tem fator. Hoje, quem tem
a senha consegue um JWT `aal1` e, pelo console do navegador ou pelo PostgREST direto, lê os
dados mesmo sem o código — o middleware só desvia a navegação.

O caminho mais curto é uma migração nova (com número próprio, ainda não reservado) que
redefine `conta_ativa()` — que já está em todas as policies e nas do Storage — para exigir
`aal2` de quem tem fator verificado. Esboço, a testar no PGlite (que precisa de um
`auth.mfa_factors` de mentira) antes de qualquer aplicação:

```sql
create or replace function conta_ativa()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from perfis_acesso
    where user_id = auth.uid()
      and status = 'ativo'
      and (expira_em is null or expira_em >= current_date)
  )
  and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    )
  );
$$;

notify pgrst, 'reload schema';
```

Antes de aplicar, conferir: as RPCs `admin_*` usam `e_master()` e não passam por
`conta_ativa()` (a conta master precisaria da mesma condição lá); e o cron/webhooks usam a
service role, que ignora RLS e não é afetada.

### Conta que perdeu o celular

Não há "esqueci o código" na tela de propósito: um atalho ali seria o atalho do invasor que
já tem a senha. Quem perdeu o app autenticador pede ao **dono do projeto**, que remove o fator
pelo **SQL Editor do Supabase**.

1. **Confirme que é a pessoa** por outro canal (WhatsApp/telefone já conhecidos). É o passo
   que impede que um golpista com a senha peça para "tirar o código".
2. Veja os fatores da conta:

   ```sql
   select f.id, f.factor_type, f.status, f.friendly_name, f.created_at, u.email
   from auth.mfa_factors f
   join auth.users u on u.id = f.user_id
   where u.email = 'pessoa@exemplo.com';
   ```

3. Remova (os desafios pendentes do fator saem junto, por cascata):

   ```sql
   delete from auth.mfa_factors
   where user_id = (select id from auth.users where email = 'pessoa@exemplo.com');
   ```

4. Se a suspeita for de celular roubado, encerre também as sessões abertas da conta (ela
   entra de novo com a senha):

   ```sql
   delete from auth.sessions
   where user_id = (select id from auth.users where email = 'pessoa@exemplo.com');
   ```

Se a pessoa estava parada na tela do código, ela toca em **Sair e entrar com outra conta** e
entra de novo só com a senha (a sessão antiga ainda lista o fator no cookie; a nova, não).
Depois, se quiser, ativa de novo em Configurações com o celular novo. Para a própria conta
master, o caminho é o mesmo (é o dono do projeto quem tem o SQL Editor).

## Captcha (Cloudflare Turnstile)

Ligado **só** se `NEXT_PUBLIC_TURNSTILE_SITE_KEY` existir. Sem a variável nada muda: o widget
não aparece, a CSP não abre origem nova e as chamadas ao Supabase Auth vão sem `captchaToken`.

### Ativar

A ordem importa. Com o captcha ligado no Supabase e o site ainda sem a variável, **todo**
login, cadastro e recuperação passa a falhar.

1. **Cloudflare → Turnstile → Add widget.** Domínios: o de produção e o dos previews da
   Vercel. Modo "Managed". Anote a **Site Key** (pública) e a **Secret Key**.
2. **Vercel → Settings → Environment Variables:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = Site Key
   (Production e Preview). Faça um **novo deploy**: variável `NEXT_PUBLIC_` entra no bundle na
   hora da build, não basta salvar.
3. Confira no site publicado que o widget aparece no login, no cadastro e em "Esqueci minha
   senha".
4. **Supabase → Authentication → Attack Protection** (antigo *Bot and Abuse Protection*):
   ligar **Enable Captcha protection**, provedor **Turnstile by Cloudflare**, colar a
   **Secret Key** e salvar.

Para desligar, a ordem inversa: primeiro desliga no Supabase, depois remove a variável e faz
deploy.

### O que passa pelo captcha

| Tela | Chamada |
| --- | --- |
| `/login` | `signInWithPassword` e o "Reenviar e-mail de confirmação" (`resend`) |
| `/signup` | `signUp` |
| `/recuperar` | `resetPasswordForEmail` (Server Action, recebe o token do widget) |
| Configurações → Acesso | a reentrada com a senha atual antes de trocar a senha |

Não passam: entrar com o Google (OAuth não usa captcha no Supabase) e o código do app
autenticador. O token do Turnstile é de uso único: depois de cada tentativa o widget é refeito
(`useCaptcha().renovar()` em `components/auth/Captcha.tsx`).

### CSP

Com a variável presente, `lib/csp.ts` acrescenta `https://challenges.cloudflare.com` em
`script-src` (o script é inserido por componente nosso, então o `strict-dynamic` já o
autorizaria; a origem é a reserva de navegador antigo) e cria `frame-src 'self'
https://challenges.cloudflare.com` (o desafio roda num iframe). Nonce e `strict-dynamic`
continuam; `'unsafe-inline'` e `'unsafe-eval'` continuam fora em produção.

### Desenvolvimento local

A Cloudflare publica chaves de teste: Site Key `1x00000000000000000000AA` e Secret Key
`1x0000000000000000000000000000000AA` sempre passam. Use-as no `.env.local` e num projeto do
Supabase de teste — nunca no de produção.
