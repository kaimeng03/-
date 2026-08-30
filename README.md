# newskill

個人化的建築新聞閱讀器，取代 Feedly。每個人用自己的 Google 帳號登入，各自管理自己的新聞來源、分類、已讀/收藏狀態，彼此完全獨立。整合多個建築新聞來源，並且：

- 點文章可以直接在網站內閱讀「完整內文」，不用跳轉回原網頁（會自動從原文網頁擷取全文，而不是只顯示摘要）
- 原網站需要登入/訂閱、有防機器人驗證，或內文擷取不可靠時，會自動改顯示 RSS 提供的內容並清楚註明，而不是顯示登入頁的垃圾內容
- 所有圖片都透過自己的伺服器轉發（image proxy），避免原本在 Feedly 上圖片破圖的問題
- 文章標題、摘要、內文會自動翻譯成繁體中文；右上角「繁中 / EN」可即時切換介面語言與文章語言，不用重新整理頁面（見下方「翻譯功能」）
- 已讀/未讀、收藏、今日/未讀/已收藏篩選、標題與摘要搜尋（Feedly 常用的晨間閱讀流程）——已讀/收藏狀態存在資料庫，換裝置、換瀏覽器登入同一個 Google 帳號都看得到
- 左側可依「資料夾」分類瀏覽不同新聞來源，登入後可以在網站上新增/取消關注網站、新增/刪除分類，這些都只影響自己的帳號
- 除了 RSS，也支援沒有 RSS 的網站：用「HTML adapter」直接解析該網站的新聞列表頁（目前內建建築師雜誌 `/page_news/` 的 adapter，見 `src/lib/adapters/`）
- 每 15 分鐘自動更新一次文章列表，也可手動按「重新整理」
- 新帳號第一次登入時，新聞首頁是空的，可以選擇工作類別瀏覽推薦來源，或直接「新增網站」加入自己想追蹤的新聞來源（不會自動幫你訂閱任何東西）

> 少數網站（目前是 Dezeen、The Architect's Newspaper）有較強的防爬蟲保護，擷取完整內文會失敗，此時會顯示 RSS 內容或摘要並附上原文連結，其餘功能（包含縮圖）不受影響。

## 本機開發

```bash
npm install
npx prisma dev              # 在本機啟動一個免帳號的開發用 PostgreSQL（第一次執行會詢問要不要建立）
cp .env.example .env.local  # 複製後至少填入 DATABASE_URL（見下方「資料庫設定」）
npm run db:migrate          # 建立資料表
npm run db:seed             # 匯入 data/sources.json 作為推薦來源目錄（不會自動幫任何人訂閱）
npm run dev
```

打開 http://localhost:3000。未設定 Google 登入（見下方「Google 登入設定」）前，首頁會清楚顯示「尚未設定 Google 登入」，其餘頁面都需要先登入才能使用。

## 測試

```bash
npm run lint               # ESLint
npx tsc --noEmit           # TypeScript 型別檢查
npm test                   # Vitest 單元測試（含連到本機資料庫的多使用者隔離測試）
npm run build               # 正式 build
npm run db:generate         # 重新產生 Prisma Client（改動 prisma/schema.prisma 後執行）
npm run db:migrate          # 建立/套用資料庫遷移
npm run db:seed             # 重新匯入推薦來源目錄（可重複執行，不會產生重複資料）
```

> 新增/修改 API 路由（`src/app/api/**`）後，若 `npx tsc --noEmit` 出現 `Cannot find module '.../route.js'` 或 `AppRouteHandlerRoutes` 相關錯誤，先執行一次 `npx next typegen`（或 `npm run dev`/`npm run build`）重新產生 Next.js 的路由型別，這是 Next.js 的正常行為，不是錯誤。

> 用 `npx prisma dev` 起的本機資料庫，主資料庫的名稱本身就叫 `template1`——這是 PostgreSQL 建立新資料庫時預設會複製的樣板，執行過幾次遷移後 `template1` 已經有完整的資料表結構，之後 `npm run db:migrate` 用來檢查/產生遷移的暫時性 shadow database 若沒有指定獨立位置，會意外繼承這份結構而報錯（`type "SourceType" already exists` 之類）。解法是在 `.env`／`.env.local` 額外設定 `SHADOW_DATABASE_URL`，指到 `npx prisma dev ls` 顯示的 shadow 位址（通常是主資料庫連接埠 +1，例如主資料庫在 `51214` 則 shadow 在 `51215`）；`prisma.config.ts` 已經讀取這個變數。用 Vercel Marketplace 的 Neon/Supabase/Prisma Postgres 則不會遇到這個問題，不需要設定這個變數。

測試套件裡有一部分（`src/lib/db/*.test.ts`）會連到 `DATABASE_URL` 指定的資料庫做真實的讀寫測試（多使用者資料隔離、舊資料匯入的冪等性等），不是 mock。這些測試只會操作以 `@test.local` 結尾的測試帳號，執行前後都會清乾淨，但**請確認 `DATABASE_URL` 指向本機或測試用資料庫，不要指向正式站資料庫**。若執行測試時沒有設定 `DATABASE_URL`，這部分測試會自動跳過並在終端機顯示提示，不會讓整個測試套件失敗。

## Google 登入設定

newskill 使用 Google 帳號登入（Auth.js + Google OAuth），只會取得你的 email、姓名、大頭貼，**不會**取得或儲存你的 Gmail 密碼，也不會要求 Gmail、聯絡人、日曆或雲端硬碟的權限。以下步驟只需要做一次：

### 1. 建立 Google Cloud 專案

1. 前往 https://console.cloud.google.com ，登入你的 Google 帳號
2. 右上角選單建立一個新專案（或選用現有專案）

### 2. 設定 OAuth 同意畫面

1. 左側選單「API 和服務」→「OAuth 同意畫面」
2. User Type 選「外部」（External）
3. 填寫應用程式名稱（例如 `newskill`）、你的信箱等必填欄位，其餘可先留預設值儲存
4. **開發/測試階段**：畫面會停留在「測試中」（Testing）狀態，這時只有你在「測試使用者」（Test users）名單裡加入的 Google 帳號才能登入——把你自己（以及需要使用的人）的 Google 帳號加進這個名單
5. **要開放給所有人用**：之後在同一頁按「發布應用程式」（Publish App），Google 可能會要求額外驗證（視使用的權限範圍而定；newskill 只要求 `openid email profile` 這種基本權限，通常不需要複雜審核）

### 3. 建立 OAuth 用戶端

1. 左側「API 和服務」→「憑證」（Credentials）→「建立憑證」→「OAuth 用戶端 ID」
2. 應用程式類型選「網頁應用程式」
3. **已授權的 JavaScript 來源**（Authorized JavaScript origins）新增：
   - 本機開發：`http://localhost:3000`
   - 正式站：你的正式網址，例如 `https://newskill.vercel.app`
4. **已授權的重新導向 URI**（Authorized redirect URIs）新增：
   - 本機開發：`http://localhost:3000/api/auth/callback/google`
   - 正式站：`https://newskill.vercel.app/api/auth/callback/google`（換成你自己的網址）
5. 建立後會拿到「用戶端 ID」和「用戶端密碼」——**不要**把用戶端密碼直接貼到程式碼或公開的地方

### 4. 設定環境變數

複製 `.env.example` 為 `.env.local`（本機）或到 Vercel 專案的 Settings → Environment Variables（正式站），填入：

- `AUTH_GOOGLE_ID` = 剛剛的用戶端 ID
- `AUTH_GOOGLE_SECRET` = 剛剛的用戶端密碼
- `AUTH_SECRET` = 執行 `npx auth secret` 自動產生（或自行用 `openssl rand -base64 32` 產生一組亂數）

設定完成、重新啟動（本機）或重新部署（Vercel）後，首頁的「使用 Google 帳號登入」按鈕就能正常運作。**沒有設定的話**，首頁會清楚顯示「尚未設定 Google 登入」的說明，而不是空白畫面或看不懂的錯誤。

## 資料庫設定

newskill 需要一個 PostgreSQL 資料庫，儲存每個使用者自己的分類、追蹤的新聞來源、已讀/收藏狀態。推薦透過 Vercel Marketplace 建立（跟 Vercel 專案綁在一起，設定最簡單），以下三選一都可以：

- **Neon**（推薦，有免費額度）：Vercel 專案 → Storage → Create Database → 選 Neon → 建立後會自動把 `DATABASE_URL` 加進專案的環境變數
- **Supabase**：同上，Storage → Create Database → 選 Supabase
- **Prisma Postgres**：同上，Storage → Create Database → 選 Prisma Postgres

三者都會在建立後自動提供 `DATABASE_URL`，不需要手動拼接連線字串。若不透過 Vercel Marketplace，也可以用任何你自己的 PostgreSQL（例如自架、其他雲端服務），把連線字串設成 `DATABASE_URL` 即可，格式是 `postgresql://使用者:密碼@主機:5432/資料庫名稱`。

### 套用資料表結構 + 建立推薦來源目錄

**`db:migrate`（`prisma migrate dev`）跟 `db:deploy`（`prisma migrate deploy`）用途完全不同，正式站／production 資料庫只能用 `db:deploy`：**

- **本機開發**：`DATABASE_URL` 設定好之後執行

  ```bash
  npm run db:migrate   # 本機專用：比對 schema 差異、需要時互動式產生新的 migration 檔案，並套用到本機資料庫
  npm run db:seed      # 把 data/sources.json 匯入成全站共用的「推薦來源目錄」（不會自動幫任何人訂閱）
  ```

- **正式站／production**：只執行

  ```bash
  npm run db:deploy    # 正式站專用：只套用 prisma/migrations/ 裡既有的 migration，不會比對 schema 差異、不會產生新 migration、不會詢問任何問題
  npm run db:seed      # 把 data/sources.json 匯入成全站共用的「推薦來源目錄」（不會自動幫任何人訂閱）
  ```

  正式站第一次設定的完整順序是先 `npm run db:deploy` 再 `npm run db:seed`。

三個指令都可以重複執行：`db:migrate`／`db:deploy` 只會套用還沒套用過的變更，`db:seed` 是以網址去重的 upsert，不會產生重複的來源。

> ⚠️ **絕對不要在正式站／production 資料庫執行 `prisma migrate reset` 或 `prisma db push --force-reset`。** 這兩個指令會清空資料庫重建，正式站上所有使用者的帳號、分類、追蹤來源、已讀/收藏紀錄都會被永久刪除且無法復原。它們只適合在本機開發資料庫需要重來一次時使用。

### 確認連線是否成功

部署到 Vercel 後，用任一 Google 帳號登入 newskill：能正常看到（空的）新聞首頁，代表資料庫連線與資料表都正確；如果看到伺服器錯誤頁面，先檢查 Vercel 專案的 Environment Variables 裡 `DATABASE_URL` 是否存在，以及是否已經對正式資料庫執行過 `db:deploy`。

## 部署到 Vercel（免費）

GitHub repository 已經設定好，本機的 git remote 也已經指到這裡。以下步驟只需要做一次，之後只要 `git push`，網站就會自動重新部署。

### 1. 把本機程式碼推送上去

在 `site` 資料夾內執行：

```bash
git push -u origin main
```

### 2. 註冊 / 登入 Vercel

前往 https://vercel.com/signup，選擇「Continue with GitHub」，用同一個 GitHub 帳號直接登入。

### 3. 建立 Vercel 專案並部署

1. 登入 Vercel 後按「Add New...」→「Project」
2. 選擇剛剛推送的 repository → Import
3. Framework Preset 會自動偵測為 Next.js，其他設定不用改
4. 按「Deploy」，等待約 1-2 分鐘

### 4. 設定資料庫與環境變數

1. 依上方「資料庫設定」章節，透過 Storage 分頁建立一個 Postgres 資料庫（`DATABASE_URL` 會自動加入）
2. 依上方「Google 登入設定」章節，在 Settings → Environment Variables 補上 `AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET`、`AUTH_SECRET`
3. 在本機（或任何能連到正式資料庫的環境，但**連的是正式資料庫**時）依序執行 **`npm run db:deploy`**（套用既有 migration 建立資料表，正式站不要用 `db:migrate`）、再執行 `npm run db:seed`（建立推薦來源目錄）
4. 建議另外設定 `NEXT_PUBLIC_SITE_URL`（見下方「同源保護 / CSRF」）
5. Redeploy 一次讓新的環境變數生效

完成後 Vercel 會給你一個網址，用 Google 帳號登入即可開始使用。之後想更新網站程式碼，只要在本機改完、`git push`，Vercel 就會自動重新部署（`package.json` 的 `postinstall` 會在 Vercel 每次乾淨安裝依賴時自動執行 `prisma generate`，所以被 `.gitignore` 排除、不會進版控的 `src/generated/prisma` 一定會重新產生，不需要手動處理）；`prisma/schema.prisma` 有變動、新增了 migration 檔案時，記得在能連到正式資料庫的環境對正式資料庫執行 **`npm run db:deploy`**（不是 `db:migrate`）。

### 查看正式站日誌（不外洩機密）

Vercel 專案的「Logs」分頁可以看到執行紀錄。程式碼刻意不記錄任何 token、密碼、session 內容到日誌裡；若你自己要加日誌，避免印出 `req.headers`、cookie、`AUTH_SECRET`、`DATABASE_URL` 等完整內容。

## 匯入舊版資料

如果你在升級成 Google 登入之前，已經用舊版（`ADMIN_PASSWORD` + `data/sources.json`）新增過自己的新聞來源，或在瀏覽器裡累積了已讀/收藏紀錄，可以把它們匯入到你的新帳號。這兩個匯入都在登入後的「設定」頁進行，且都可以重複執行、不會產生重複資料。

### 舊版 `data/sources.json` → 你的分類與追蹤項目

只有一組帳號能執行這個匯入（避免任何登入的人都能把整份舊資料塞進自己帳號）：

1. 在環境變數設定 `LEGACY_OWNER_EMAIL` = 你原本用來管理網站的 Google 帳號 email（不要寫死在程式碼裡，只透過環境變數指定）
2. 用這個帳號登入 newskill，到「設定」頁，如果偵測到還沒匯入過，會看到「匯入舊版新聞來源」的區塊，並顯示 `data/sources.json` 裡有幾個分類、幾個來源
3. 按下匯入：會把每個舊分類建立成你自己的分類、每個舊來源建立成你的追蹤項目（來源本身若已存在會直接重複使用，不會建立重複的來源）
4. 匯入成功後不會再顯示這個提示；其他帳號登入永遠不會看到這個匯入選項

### 瀏覽器裡的已讀/收藏紀錄 → 你的帳號

適用任何使用者，不限於上面的舊版擁有者：

1. 用同一台電腦、同一個瀏覽器登入 newskill（舊版的已讀/收藏是存在瀏覽器 localStorage，換瀏覽器或清過資料就偵測不到）
2. 如果偵測到瀏覽器裡有舊版的已讀/收藏紀錄，「設定」頁會看到「匯入此瀏覽器的已讀與收藏」，並顯示筆數
3. 按下匯入：會同步寫入你帳號的資料庫（之後換裝置、換瀏覽器登入同一個帳號都看得到）
4. 匯入失敗也不會刪除瀏覽器裡原本的資料，可以之後再試一次
5. 匯入成功後不會再顯示這個提示

## 新增新聞來源 / 分類資料夾

左側選單最上方的「＋ 新增網站」按鈕（填網站名稱、RSS 網址或網站首頁網址、選分類）、分類清單最下方的「＋ 新增分類」按鈕，以及每個分類/來源右側的「✕」，登入後就能直接使用，不需要額外的管理員權限。新增/刪除只影響**你自己**的分類與追蹤項目：如果別人也追蹤同一個新聞網站，你取消追蹤不會影響到他們，反之亦然。刪除分類時，分類內還有來源的話，會先告知數量，第二次更明確的警告確認後才會連同來源一併刪除。

新增網站時的偵測順序：

1. 先比對是不是已知需要專屬 adapter 的網站（目前是建築師雜誌 `/page_news/`，見下方）——是的話直接用該 adapter 解析，不會嘗試當成 RSS。
2. 不是的話，直接當作 RSS/Atom feed 讀讀看 → 是 HTML 的話找 `<link rel="alternate">` 自動偵測 → 都沒有的話嘗試 `/feed`、`/rss` 等常見路徑。

都沒偵測到的話會清楚顯示「沒有偵測到 RSS/Atom feed」，不會捏造假網址。同一個網站不論是誰先加入，底層只會存一份（依網址判斷是否相同），你追蹤時只會建立你自己的追蹤記錄，不會重複抓取或重複顯示。

**建築師雜誌 `/page_news/` 這個沒有 RSS 的網站，可以直接在「新增網站」欄位貼上它的網址新增**（`https://www.twarchitect.org.tw/page_news/`），系統會自動用內建的 adapter 抓取。其他還沒有 RSS 的網站，需要先在 `src/lib/adapters/` 寫一個新的 adapter（並在 `src/lib/adapters/match.ts` 註冊網址判斷規則）才能透過介面新增；沒有對應 adapter 的網站，一般 RSS 流程還是會如常嘗試（多半會提示找不到 RSS/Atom feed）。

### 新增來源的三個平等入口

「＋ 新增網站」打開後有三個分頁，彼此平等，沒有哪一個是「主要」功能：

1. **精選來源**：依工作類別瀏覽已驗證的推薦來源（見下方「精選來源目錄」），可切換瀏覽任何類別、不限於自己登入時選的那個；未追蹤時一鍵「追蹤」即可加入（需選擇要放進哪個分類），已經追蹤的來源會直接顯示「取消追蹤」，點擊後跟側邊欄「✕」一樣，只刪除自己的追蹤記錄，不影響其他使用者、也不會刪除全域來源。
2. **搜尋全部來源**：用名稱、ISSN、DOI 或關鍵字搜尋整個已驗證目錄（跨所有職業領域），不含其他使用者自行新增的來源。
3. **自行新增**：貼網址／RSS 網址，或輸入 DOI、ISSN、期刊名稱、專業關鍵字；系統會先「偵測」並顯示候選結果與最近文章預覽，使用者確認後才會真的建立追蹤（不會偵測完就自動訂閱）。偵測失敗時（例如網站阻擋自動讀取、暫時沒有支援）會顯示明確原因，並提供「提交來源申請」按鈕，把這次的輸入和失敗原因記錄下來（見下方「提交不支援的來源」）。

任何一個入口新增的來源都遵守同一套規則：同一個網站不論是誰、用哪個入口先加入，底層只會存一份（依網址或 provider+查詢條件判斷是否相同）；你追蹤時只會建立你自己的追蹤記錄。透過「自行新增」加入的來源預設是 `catalogStatus = user_added`，不會出現在其他使用者的「精選來源」或「搜尋全部來源」結果裡——只有下方「精選來源目錄」正式收錄（`catalogStatus = curated`）的來源才會被所有使用者看到。

## 精選來源目錄（Catalog）

`data/catalog/<profession>.json`（`architecture.json`、`tech.json`、`finance.json`、`marketing.json`、`education.json`、`health.json`、`law.json`、`creative.json`）是版本控制的精選來源清單，`npm run db:seed` 會把它們匯入資料庫，標記 `catalogStatus = curated`，並透過 `ProfessionSource` 關聯表對應到職業領域（一個來源可以同時屬於多個領域）。**所有職業領域用同一套資料模型與同一套 seed 邏輯，沒有任何領域是特殊主功能**——包含醫療／學術在內。

- 每一筆收錄的來源，在建置當下都用 `curl` 對其官方網址或官方 RSS/API 端點發送過真實請求，確認回應是有效的 RSS/Atom/JSON，驗證方式記錄在該筆資料的 `verificationNote` 欄位裡，也會寫回資料庫的 `Source.verificationNote`／`verificationStatus`／`verifiedAt`。
- 無法驗證的來源不會被加入，也不會標記為 curated——目前 `other`（其他／自訂）沒有專屬目錄，因為它本來就是給使用者自行輸入用的類別；未來若要新增其他領域尚未收錄的來源，同樣必須先能實際驗證。
- `/api/recommendations` 與 `/api/catalog/search` 只回傳 `catalogStatus = curated` 且 `active = true` 的來源——使用者自行新增的來源，即使跟目錄裡某筆資料指向同一個網址而共用同一個 `Source` 列，也不會因此變成 curated。
- UI 上一律稱為「精選來源」／「已驗證來源」，不會宣稱是「完整」或「涵蓋所有期刊」的資料庫。

### 如何新增一筆精選來源

1. 先用瀏覽器或 `curl` 實際確認官方首頁、RSS 或 API 端點真的可用（能拿到有效的 RSS/Atom/JSON，不是登入頁或錯誤頁）。
2. 在對應的 `data/catalog/<profession>.json` 加入一筆，至少包含 `name`、`homepage`、`feedUrl`、`connectorType`（`rss` / `atom` / `api` / `sitemap` / `html_adapter`）、`provider`、`language`、`country`、`contentType`、`accessType`、`verificationNote`（寫清楚怎麼驗證的）。
3. 執行 `npm run db:seed`——這個腳本是 idempotent 的，重複執行只會更新既有資料，不會產生重複的 `Source` 或 `ProfessionSource`。
4. 一個來源要同時出現在多個領域，就在對應的每個 `data/catalog/<profession>.json` 都加一筆相同 `homepage` 的資料；seed 腳本會依網址正規化後的 `normalizedUrl` 自動去重成同一個 `Source`，只會各自建立對應的 `ProfessionSource` 關聯。

### 如何新增一個 connector

`src/lib/connectors/` 是統一、可測試的 connector 架構：

- `genericFeed.ts` / `feedDiscovery.ts`：通用 RSS/Atom 自動偵測（真正的 HTML 解析，見 `htmlLinks.ts`，不是脆弱的正規表示式），支援 `<base href>`、多重 `rel` token、相對路徑探索。
- `sitemap.ts`：Sitemap／Sitemap Index 預覽（只給候選網址清單，不會直接當成新聞來源）。
- `europepmc.ts` / `pubmed.ts` / `crossref.ts`：學術文獻 provider，見下方「學術文獻 Provider」。
- `discover.ts`：統一入口 `discoverSource(input)`，依輸入格式（網址／DOI／ISSN／期刊名稱／關鍵字）分派給對應 connector，回傳預覽結果，不建立任何資料。
- `errors.ts`：統一錯誤代碼（`ConnectorError` + `ConnectorErrorCode`），對應到穩定的 HTTP 狀態碼。

新增一個 provider 時：實作 `discover`/`preview`/`fetchArticles`／輸出統一的 `NormalizedArticle` 格式（欄位不存在就填 `null`，不得用猜的），所有對外請求都要透過 `src/lib/safeFetch.ts`（SSRF 防護、timeout、大小上限），錯誤一律轉成 `ConnectorError`（見上方錯誤代碼清單），不要用 `console.error` 記錄可預期的失敗（429、無結果、逾時等），只有真正非預期的程式錯誤才能用 `console.error`，而且不能記錄 headers、cookie、API Key 或完整網址查詢字串。

### 學術文獻 Provider（Europe PMC / PubMed / Crossref）

這三個是跟其他來源同等級的 connector/provider，**不是獨立的「醫學與學術」主功能**，`health` 以外的領域（教育、法律、財經、建築等）一樣可以用 DOI/ISSN 查詢透過 Crossref 建立來源。

- **Europe PMC**：官方 REST API（<https://europepmc.org/developers>），不需要 API Key。
- **PubMed**：官方 E-utilities（<https://www.ncbi.nlm.nih.gov/home/develop/api/>），用 `esearch` 拿到一批 ID 後，一次 `esummary` 批次查詢全部，不會逐篇文章各發一次請求；沒有 `NCBI_API_KEY` 時全站對 PubMed 的請求節流在每秒最多 3 次。
- **Crossref**：官方 REST API（<https://www.crossref.org/documentation/retrieve-metadata/rest-api/>），支援 DOI 直接查詢、ISSN 篩選、關鍵字搜尋，不需要 API Key；設定 `CROSSREF_MAILTO` 可進入回應更穩定的「polite pool」。

三者遇到官方 API 回傳 429 或暫時無法使用時，都會回傳 `RATE_LIMITED`／`PROVIDER_UNAVAILABLE` 錯誤代碼並清楚顯示訊息，不會假裝查詢成功。相關環境變數見 `.env.example`（`NCBI_API_KEY`、`NCBI_TOOL`、`NCBI_EMAIL`、`CROSSREF_MAILTO`，全部選填、只用於伺服器端組請求，不會出現在瀏覽器或存進資料庫的 `connectorConfig`）。

透過這三個 provider 加入的來源，追蹤後會正常出現在首頁——`src/lib/feeds.ts` 會依 `Source.provider` 分派到對應的 `fetchEuropePmcArticles`／`fetchPubMedArticles`／`fetchCrossrefArticles`，並跟 RSS 來源一樣經過既有的翻譯與排序流程；`connectorConfig` 會先做 runtime 檢查（Europe PMC 需要非空 `query`、PubMed 需要非空 `term`、Crossref 需要 `query` 或 `issn` 其中之一），設定不正確或 provider 未知時會在該來源明確失敗（列進「更新失敗」清單），不會靜默顯示空白或假資料；單一 provider 失敗不影響其他來源。這類來源沒有全文可看，文章頁一律顯示摘要與「查看原始網頁」連結，不會保存或顯示需要付費訂閱的全文。

「自行新增」的查詢來源可以手動選擇「自動判斷／Crossref／Europe PMC／PubMed」；網址一律仍走 RSS/Atom/Sitemap/adapter 偵測，不受這個選項影響；DOI 一律用 Crossref 解析；ISSN 預設用 Crossref，選擇 PubMed 或 Europe PMC 時才改用該 provider。

**醫療內容提醒**：只有分類為 health（醫療／健康）的來源或內容旁邊才會顯示「newskill 提供新聞與文獻整理，不構成醫療診斷或治療建議。」這則提醒；其他領域不會出現這段文字。

### 內容版權

newskill 只會保存或顯示發布方本來就透過 RSS／官方 API／公開頁面提供的內容：文章標題、摘要／abstract、縮圖、原文連結，以及（若 API 有提供）作者、DOI、PMID、是否同行評審／預印本／開放取用等 metadata。**不會**保存或重新發布需要付費訂閱才能看到的完整全文；原網站有登入牆或內容限制時，一律退回顯示 RSS 提供的摘要並附上原文連結（見上方「內容擷取」相關行為）。

### 提交不支援的來源

「自行新增」偵測失敗時（`ACCESS_BLOCKED`、`RATE_LIMITED`、`NO_FEED_FOUND`、`UNSUPPORTED_SOURCE` 等狀況），會出現「提交『希望支援此來源』的申請」按鈕，送出後會記錄你輸入的內容、系統偵測到的失敗原因，存在只有你自己看得到的 `SourceSubmission` 資料。這只是留下紀錄，不會自動重試或自動繞過網站的防護機制（newskill 不會嘗試繞過登入牆、付費牆或防機器人驗證）。

## 翻譯功能

網站會自動把標題、摘要、內文翻譯成繁體中文。預設使用完全免費、不需註冊的 MyMemory 翻譯 API，但它的免費額度非常小，實測在文章一多時常常會翻譯失敗（此時會直接顯示英文原文，不影響其他功能）。

如果想讓翻譯穩定運作，建議申請 **Microsoft Azure Translator** 免費額度（每月 200 萬字元免費，長期有效，支援繁體中文）：

1. 前往 https://portal.azure.com 註冊/登入（需要信用卡驗證身份，但免費額度內不會扣款）
2. 建立資源 → 搜尋「Translator」→ 建立，Pricing tier 選 **Free F0**
3. 建立完成後，到該資源的「Keys and Endpoint」頁面，複製 KEY 1 和 Region
4. 在 Vercel 專案的 Settings → Environment Variables，新增：
   - `AZURE_TRANSLATOR_KEY` = 剛剛複製的 KEY
   - `AZURE_TRANSLATOR_REGION` = 剛剛複製的 Region（例如 `eastasia`）
5. 重新部署（Redeploy）即可生效

本機開發若要測試，可以複製 `.env.example` 為 `.env.local` 並填入同樣的值。

## 同源保護 / CSRF

新增/刪除網站或分類、更新已讀/收藏狀態、匯入舊資料、刪除帳號這幾個會修改資料的 API，除了要求登入，也會檢查請求的 `Origin` 是不是本站——不是的話一律擋下（回傳 403），避免其他網站誘導已登入使用者的瀏覽器發出偽造請求。這個檢查刻意不採信請求自帶的 `Host`／`X-Forwarded-Host`，而是跟伺服器自己設定的網址比對：

- 部署在 Vercel 時，`VERCEL_PROJECT_PRODUCTION_URL`／`VERCEL_URL` 由 Vercel 自動提供，一般不用手動設定。
- 想確保萬無一失，或使用自訂網域，建議額外設定 `NEXT_PUBLIC_SITE_URL`（例如 `https://newskill.vercel.app` 或你的自訂網域），設定後以此為準。這個網址同時也是 Google OAuth 導回本站時預期比對的來源，跟上面「Google 登入設定」的 Authorized JavaScript origins 要一致。
- 本機開發環境（`npm run dev`）固定允許 `http://localhost:3000`，不需要另外設定。
- 都沒有比對到的話，API 會回傳「跨來源請求已被拒絕」（403）——這是刻意的安全預設（fail closed），不是 bug。

## 多使用者資料隔離

每個人的分類、追蹤的新聞來源、已讀/收藏狀態，都只屬於登入的那個 Google 帳號本人：

- 所有個人資料的 API，一律從伺服器端的登入 session 取得使用者身份，**不會**相信請求裡帶的任何 userId（不論放在網址、query string 還是傳入的資料裡）
- 兩個人追蹤同一個新聞網站時，底層只會有一份「來源」資料（省流量、共用快取），但各自的追蹤記錄、分類歸屬、已讀/收藏完全分開
- 取消追蹤只會刪除自己的追蹤記錄，不會刪除底層的來源資料（其他還在追蹤的人不受影響）
- 猜測別人的分類/來源 ID 想直接修改或刪除，會被擋下（回傳 404，不會洩漏這筆資料到底存不存在、屬於誰）
- 刪除帳號只會刪除自己的分類、追蹤記錄、已讀/收藏、登入紀錄，不會刪除還有其他人在追蹤的來源

## 已知限制

- MyMemory 免費翻譯額度很小，未設定 Azure Translator 時常見翻譯失敗（自動退回顯示英文原文，不影響其他功能）。
- Dezeen、The Architect's Newspaper 有較強的防爬蟲保護，完整內文擷取常失敗，會自動退回顯示 RSS 內容或摘要。
- 少數 ArchDaily 文章的擷取內容開頭會混入一小段網站自身的 UI 文字（例如影片長度標籤、「Subscriber Access」小標籤），實際文章全文仍完整可讀，屬於次要的內容擷取雜訊，非登入牆阻擋。
- Rate limit（新增/刪除、已讀/收藏同步、重新整理）採記憶體內計數，僅在單一伺服器執行個體內有效；在 Vercel 這類多執行個體/會冷啟動的環境下是盡力而為的防護，非嚴格保證。
- 網站介面可以新增任何 RSS/Atom 來源、Sitemap（僅預覽，不會直接當新聞來源）、透過 DOI/ISSN/期刊名稱/關鍵字查詢的 Europe PMC／PubMed／Crossref 條目，以及已經寫好 adapter 並在 `src/lib/adapters/match.ts` 註冊網址規則的 HTML 來源（目前是建築師雜誌 `/page_news/`）；其他還沒有對應 connector 或 adapter 的網站，需要先寫程式加上，無法單純透過介面新增（可以先提交「希望支援此來源」的申請）。
- CSRF 的 Origin 檢查沒有另外做 CSRF token 機制，改以 `SameSite=Lax`／資料庫 session cookie 搭配 Origin 比對作為主要防禦；這是現代瀏覽器下被廣泛接受的做法，但不是雙重保險。
- 「精選來源目錄」目前只收錄了每個職業領域少數幾筆已實際驗證過的來源（見「精選來源目錄」章節列出的筆數），不是涵蓋所有期刊/媒體的完整資料庫；`other`（其他／自訂）類別沒有專屬目錄，設計上就是給使用者自行輸入。
- 「自行新增」的「確認新增」需要先前一步「偵測」產生的 `previewToken`（伺服器簽章、10 分鐘內有效），不接受前端自行組出的候選來源資料，也不會為了確認而重新呼叫一次外部 API。
- `npm run db:seed` 使用的 `prisma` CLI（devDependency，非執行期程式碼）目前有 3 項 npm audit 回報的高風險項目，來自其間接依賴 `deepmerge-ts`（需要自行提供惡意的、深度遞迴的設定物件才會觸發，不是外部攻擊者可利用的正式站漏洞）；已刻意固定 `prisma`/`@prisma/client` 在 `7.10.0`，未跟隨 npm 「latest」升到不穩定的 `8.0.0-rc.x`。
