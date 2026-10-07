// インストール直後の案内ページ: バージョンとリポジトリへのリンクを manifest から入れる。
(() => {
  const manifest = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest
    ? chrome.runtime.getManifest()
    : {};
  document.getElementById('version').textContent = manifest.version || '';

  // リポジトリの URL は manifest の homepage_url の1か所で管理する（未設定・仮の値なら出さない）
  const repo = manifest.homepage_url || '';
  if (repo && !repo.includes('YOUR-GITHUB-NAME')) {
    document.getElementById('repo').href = repo;
    // 使い方ガイドも GitHub 上の読みやすい表示で開く（未設定なら同梱の README.md をそのまま開く）
    document.getElementById('guide').href = `${repo.replace(/\/$/, '')}/blob/main/extension/README.md`;
  } else {
    document.getElementById('repo-wrap').hidden = true;
  }
})();
