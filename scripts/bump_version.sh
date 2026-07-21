#!/usr/bin/env bash
# 用法: ./scripts/bump_version.sh [patch|minor|major]
# 同步更新 package.json version、app.json 的 expo.version / ios.buildNumber / android.versionCode
# 並建立對應的 git commit + tag。執行前請確認 working tree 是乾淨的。

set -euo pipefail

BUMP_TYPE="${1:-patch}"
APP_JSON="app.json"
PKG_JSON="package.json"

if [[ ! -f "$APP_JSON" || ! -f "$PKG_JSON" ]]; then
  echo "錯誤：找不到 app.json 或 package.json，請在專案根目錄執行。" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "錯誤：working tree 有未 commit 的變更，請先 commit 或 stash。" >&2
  exit 1
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
  major)
    MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1)); PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
  *)
    echo "錯誤：BUMP_TYPE 必須是 patch / minor / major" >&2
    exit 1
    ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
echo "版本：${CURRENT_VERSION} → ${NEW_VERSION}"

# 更新 package.json version
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '${NEW_VERSION}';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# 更新 app.json：expo.version、ios.buildNumber（遞增字串數字）、android.versionCode（遞增整數）
node -e "
  const fs = require('fs');
  const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  const expo = appJson.expo;

  expo.version = '${NEW_VERSION}';

  expo.ios = expo.ios || {};
  const currentBuildNumber = parseInt(expo.ios.buildNumber || '0', 10);
  expo.ios.buildNumber = String(currentBuildNumber + 1);

  expo.android = expo.android || {};
  const currentVersionCode = expo.android.versionCode || 0;
  expo.android.versionCode = currentVersionCode + 1;

  fs.writeFileSync('app.json', JSON.stringify(appJson, null, 2) + '\n');
"

git add package.json app.json
git commit -m "chore: bump version to ${NEW_VERSION}"
git tag "v${NEW_VERSION}"

echo "完成。已建立 commit 與 tag v${NEW_VERSION}。"
echo "推送請執行: git push && git push --tags"
