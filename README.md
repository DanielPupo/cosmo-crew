# Cosmo Crew

Jogo cooperativo de navegador feito com Phaser, Vite, TypeScript e Supabase.

## Executar localmente

```bash
npm install
npm run dev
```

Sem configuração do Supabase, use **DEMO LOCAL** no lobby. A demo roda em um único navegador e não conecta computadores diferentes.

## Habilitar multiplayer

1. No Supabase, confirme que o projeto correto está aberto e que o banco pode ser acessado.
2. No SQL Editor, execute [`supabase/schema.sql`](./supabase/schema.sql). O script cria/atualiza as tabelas `rooms` e `players`, substitui as políticas RLS dessas duas tabelas, aplica o limite de quatro jogadores, cria funções RPC e ativa a publicação Realtime. Confirme que essas são as tabelas do jogo antes de executar.
3. Em **Authentication → Sign In / Providers**, ative **Anonymous Sign-Ins**.
4. Copie `.env.example` para `.env.local` na raiz do projeto e preencha somente:

   ```dotenv
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-publicavel-ou-anon
   ```

5. Reinicie o servidor Vite depois de alterar `.env.local`.
6. No Table Editor, confirme `rooms` e `players`. Em Database → Publications/Realtime, confirme que ambas estão em `supabase_realtime`.
7. Confirme no painel que a chave é a publicável/anon. Nunca coloque senha do banco ou `service_role` no frontend. `.env.local` está ignorado pelo Git.

Se a senha do banco já foi compartilhada, troque-a no painel do Supabase; não reutilize nem compartilhe essa senha.

## Publicar na Vercel

1. Envie o projeto para um repositório GitHub e importe esse repositório na Vercel. Se `cosmo-crew` estiver dentro de uma pasta maior, selecione `cosmo-crew` como **Root Directory**; se a raiz do repositório já contiver `package.json`, mantenha a raiz padrão.
2. Use as configurações padrão do Vite ou confirme:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
3. Em **Project Settings → Environment Variables**, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os mesmos valores públicos usados no `.env.local`. Selecione os ambientes em que pretende publicar (Production e, se desejar, Preview).
4. Faça o deploy. Sempre que alterar variáveis de ambiente, gere um novo deploy para que elas sejam incluídas no bundle.
5. No Supabase, atualize a URL do site em **Authentication → URL Configuration** para o domínio de produção da Vercel. Mantenha **Anonymous Sign-Ins** ativo e confirme que o schema e o Realtime foram configurados.
6. Abra o endereço publicado e teste a criação e entrada em salas em perfis de navegador independentes. A missão completa precisa de quatro sessões autenticadas separadas.

Não publique `.env.local`, senha do banco ou chave `service_role`. As variáveis `VITE_*` são incorporadas ao frontend; use apenas a URL e a chave pública `anon`/`publishable`.

## Testar uma partida

1. Abra o jogo em dois perfis de navegador independentes (ou navegadores/dispositivos diferentes). Abas comuns do mesmo perfil compartilham a sessão anônima e não representam jogadores separados.
2. Em um perfil, escolha **CRIAR SALA**; no outro, informe o código em **ENTRAR EM SALA**.
3. Com duas ou três pessoas, o anfitrião pode escolher **TESTAR MOVIMENTO** para validar o Broadcast entre computadores. Esse modo é somente para teste e não permite concluir a missão.
4. Complete os quatro espaços do lobby com quatro sessões para habilitar **INICIAR MISSÃO**. A missão oficial exige quatro jogadores.
5. Em computadores separados, repita os passos usando o mesmo código; confirme o roster e que os círculos se movimentam em tempo real.
6. Cada função deve interagir com sua pista: piloto (fórmula), engenheiro (massa/reparo), explorador (gravidade), artilheiro (reparo). Para investigar, compartilhem as pistas e insiram `37,1` ou `37.1`; para reparar, engenheiro e artilheiro interagem na estação; na ativação final, todos os quatro devem interagir.

## Missão e sincronização

- O início, progresso das tarefas, pontuação e resultado são persistidos em `rooms` e validados por RPCs do banco.
- Posições usam Supabase Realtime Broadcast e são enviadas em intervalos limitados, nunca a cada frame nem como atualização de banco.
- A missão dura três minutos. A pontuação de vitória soma 300 pontos de tarefas e cinco por segundo restante; tempo esgotado resulta em derrota.
- `37,1 N` é o resultado de `10 kg × 3,71 m/s²`.
- `DEMO LOCAL` permite experimentar no mesmo navegador, mas não representa teste multiplayer.

## Verificação

```bash
npm run build
```

Sem credenciais e configuração válidas não é possível confirmar partidas entre navegadores/computadores; o lobby exibe os erros de autenticação, schema e Realtime para orientar a configuração.
