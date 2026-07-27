# 技術棧選 Node.js + TypeScript，不用 Angular + Java

考慮過 Angular + Java（Spring Boot 類組合），但目前所有已知票券（#2～#13）都只涉及「任務/提醒領域服務」層，完全不含畫面；Angular 現在完全用不到，Java/Spring 這類組合的建置與執行環境（Maven/Gradle、應用伺服器）比單純的領域服務模組所需的重很多。改選 Node.js + TypeScript（測試用 Vitest），單一語言貫穿服務層與未來可能的 API 層，部署也單純（單一 process 或容器即可跑，不需要 JVM）。前端框架（Angular/React/Vue 等）留到真正要做看板 UI 時再獨立選擇，不受此決定綁死。
