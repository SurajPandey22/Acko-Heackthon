import { createApp } from "./app.js"
import { db } from "./db/client.js"

const port = Number(process.env.PORT ?? 3000)

createApp({ db }).listen(port, () => {
  console.log(`contract-guard listening on http://localhost:${port}`)
})
