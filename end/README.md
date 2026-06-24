# Som final (`end/`)

Largue **um arquivo de áudio** nesta pasta para usá-lo como o som tocado quando o
cronômetro chega a zero.

- Formatos aceitos: `.mp3`, `.wav`, `.ogg`, `.opus`, `.m4a`, `.aac`, `.flac`, `.weba`, `.webm`
- O **nome não importa** — o servidor pega o primeiro arquivo de áudio (em ordem
  alfabética) e o serve em `/end-sound`.
- Se houver mais de um, renomeie o desejado para vir antes (ex.: comece com `0_`).
- Se a pasta estiver **vazia**, o cronômetro usa o beep sintetizado padrão.

Rode com `npm start` e abra `http://localhost:5173` (abrir o `index.html` direto
pelo `file://` não funciona — os módulos e este som dependem do servidor).
