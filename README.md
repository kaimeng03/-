# 建築新聞

自架的建築新聞閱讀器，取代 Feedly。整合多個建築新聞來源的 RSS，並且：

- 點文章可以直接在網站內閱讀「完整內文」，不用跳轉回原網頁（會自動從原文網頁擷取全文，而不是只顯示摘要）
- 所有圖片都透過自己的伺服器轉發（image proxy），避免原本在 Feedly 上圖片破圖的問題
- 文章標題、摘要、內文會自動翻譯成繁體中文，右上角「繁中 / EN」按鈕可隨時切換回英文原文（見下方「翻譯功能」）
- 左側可依「資料夾」分類瀏覽不同類型的新聞來源，並直接在網站上新增網站、新增分類（見下方「新增新聞來源 / 分類資料夾」）
- 每 15 分鐘自動更新一次文章列表

> 少數網站（目前是 Dezeen、The Architect's Newspaper）有較強的防爬蟲保護，擷取完整內文會失敗，此時會顯示摘要並附上原文連結，其餘功能（包含縮圖）不受影響。

## 本機開發

```bash
npm install
npm run dev
```

打開 http://localhost:3000

## 新增新聞來源 / 分類資料夾

左側選單最上方有「＋ 新增網站」按鈕（填網站名稱、RSS 網址、選分類），分類清單最下方有「＋ 新增分類」按鈕，都可以直接在網站上操作，不用改程式碼。新增網站時會先驗證該網址是不是有效的 RSS feed，不是的話會顯示錯誤訊息。

這些資料實際存在 [data/sources.json](data/sources.json) 這個檔案裡：

- **本機開發**：直接寫入本機的這個檔案，重新整理就看得到。
- **部署到 Vercel 後**：因為 Vercel 是無狀態的，網站沒辦法自己「寫檔案」，所以新增功能需要一組有寫入權限的 GitHub Token，讓網站把改動直接 commit 回這個 GitHub repo：

  1. GitHub 右上角頭像 → Settings → 左側 Developer settings → Personal access tokens → Fine-grained tokens → Generate new token
  2. Repository access 選「Only select repositories」，選這個 repo
  3. Permissions → Repository permissions → **Contents** 設成 **Read and write**，其他都不用動
  4. Generate token，複製產生的 token（只會顯示一次）
  5. 在 Vercel 專案的 Settings → Environment Variables，新增：
     - `GITHUB_TOKEN` = 剛剛複製的 token
     - `GITHUB_REPO` = `你的帳號/repo名稱`（例如 `kaimeng03/architecture-news`）
  6. 重新部署（Redeploy）即可生效，之後在網站上新增的網站/分類都會自動 commit 回這個 repo，手機、電腦看到的是同一份清單。

  沒有設定 `GITHUB_TOKEN` 的話，網站仍然可以用，只是「新增網站/分類」這個功能無法使用（因為沒有地方可以永久儲存）。

本機開發若要測試 GitHub 版本，可以複製 `.env.example` 為 `.env.local` 並填入同樣的值。

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

## 部署到 Vercel（免費）

GitHub repository 已經設定好（`https://github.com/kaimeng03/-.git`），本機的 git remote 也已經指到這裡。以下步驟只需要做一次，之後只要 `git push`，網站就會自動重新部署。

### 1. 把本機程式碼推送上去

在 `site` 資料夾內執行：

```bash
git push -u origin main
```

第一次 push 時，會跳出瀏覽器視窗要你登入 GitHub 授權，登入完成即可。

### 2. 註冊 / 登入 Vercel

前往 https://vercel.com/signup，選擇「Continue with GitHub」，用同一個 GitHub 帳號直接登入，不用再另外設密碼。

### 3. 建立 Vercel 專案並部署

1. 登入 Vercel 後按「Add New...」→「Project」
2. 選擇剛剛推送的 repository → Import
3. Framework Preset 會自動偵測為 Next.js，其他設定不用改
4. 按「Deploy」，等待約 1-2 分鐘

完成後 Vercel 會給你一個網址，手機、電腦都可以直接打開瀏覽，之後每天早上就能取代 Feedly 使用。

想讓「翻譯」「新增網站/分類」這兩個功能穩定運作，記得照上面「翻譯功能」「新增新聞來源 / 分類資料夾」兩個章節設定對應的環境變數。

之後想更新網站程式碼，只要在本機改完、`git push`，Vercel 就會自動重新部署；新增新聞來源/分類則直接在網站上操作即可，不需要重新部署。
