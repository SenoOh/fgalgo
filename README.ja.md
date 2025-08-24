# fgalgo
fgalgoは，OpenFGA の Authorization Model と Relationship Tuples を自動生成するNode.jsツールである．
ExcelファイルやMatter仕様XMLファイルからユーザ属性とデバイス情報を読み取り，OpenFGAで使用可能な Authorization Model と Relationship Tuples を生成する．

## 主な機能

- Excelファイルからのユーザ・デバイス情報の自動読み込み
- Matter仕様XMLファイルの解析とデバイスタイプ，コマンドの組を生成
- Authorization Model（.fga）の自動生成
- Relationship Tuples の自動生成
- OpenFGA サーバへの自動デプロイ
- インタラクティブなデバイス権限設定

## 必要な環境

- Node.js (v18以上推奨)
- python3
- OpenFGA CLI (`fga` コマンド)
- OpenFGA サーバ

## セットアップ

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd fgalgo
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

`.env.sample`をコピーして`.env`ファイルを作成し，OpenFGAの接続情報を設定：

```bash
cp .env.sample .env
```

`.env`ファイルを編集：

```env
FGA_API_URL=your-openfga-api-url
FGA_STORE_ID=your-store-id
FGA_API_TOKEN=your-api-token
```

### 4. 入力ファイルの準備

以下のファイルを適切なディレクトリに配置してください：

#### デバイス関連
- `matter_xml/` - Matter仕様XMLファイル群

## 使用方法

### 基本的な実行

```bash
node main.js
```

### 実行フロー

1. ユーザ情報の処理
   - Excelファイルからユーザグループとユーザ属性を読み込み
   - ユーザ用 Authorization Model を生成
   - ユーザ用 Relationship Tuples を生成

2. デバイス情報の処理
   - MatterデバイスタイプをJSONから読み込み
   - デバイス属性をExcelから読み込み
   - インタラクティブなデバイス設定（権限，アクション）
   - デバイス用 Authorization Model を生成
   - デバイス用 Relationship Tuples を生成

3. OpenFGAへのデプロイ
   - 統合された Authorization Model をOpenFGAサーバに送信
   - すべての Relationship Tuples をアップロード

## プロジェクト構造

```
fgalgo/
├── main.js                 # メインエントリーポイント
├── package.json           
├── .env                   # 環境変数設定
├── src/                   # ソースコード
│   ├── user/             # ユーザー関連処理
│   ├── device/           # デバイス関連処理
│   ├── export/           # FGAエクスポート処理
│   └── util/             # ユーティリティ関数
├── file/                 # 入力・テンプレートファイル
│   ├── template/         # EJSテンプレート
│   ├── model/            # FGAモデルファイル
│   └── json/             # JSONデータファイル
├── matter_xml/           # Matter仕様XMLファイル
└── python/               # Python補助スクリプト
```

## 設定ファイル形式

### ユーザグループ (user_groups.xlsx)
#### 形式
| 通番 | 項目 | 内容 | 型 |
|-----|------|------------|------|
| 1 | id | ID | int |
| 2 | uid | 一意なグループ ID | string |
| 3 | name | 人間が識別可能な名称 | string |
| 4 | parent | 親階層グループ名 | string / null |


#### 例
|id| uid | name | parent |
|--|-----|------|-------|
|1| teacher | 先生のグループ |  |
|2| doctor | 博士課程学生のグループ | teacher |

### ユーザ属性 (user_attributes.xlsx)
#### 形式
| 通番 | 項目 | 内容 | 型 |
|-----|------|------------|------|
| 1 | id | ID | int |
| 2 | uid | 一意なユーザ ID | string |
| 3 | name | 人間が識別可能な名称 | string |
| 4 | group | 所属グループ | array of string / null |
| 5 | room | 所属部屋 | array of string / null |

#### 例

|id | uid | name | group | room |
|---|-----|------|-------|------|
| 1 | tanaka | 田中太郎 | teacher | room101, room102 |
| 2 | sato | 佐藤花子 | doctor | room102 |

### デバイス属性 (device_attributes.xlsx)
#### 形式
| 通番 | 項目 | 内容 | 型 |
|-----|------|------------|------|
| 1 | id | ID | int |
| 2 | uid | 一意なデバイス ID | string |
| 3 | name | 人間が識別可能な名称 | string |
| 4 | type | デバイスタイプ | string |
| 5 | room | 所属部屋 | array of string / null |


#### 例
| uid | name | type | room |
|-----|------|------|----------|
| light101 | 101号室の照明 | onofflightswitch | room101 |
| lock102 | 102号室のスマートロック | doorlock | room102 |


## 依存関係

- **@openfga/sdk** - OpenFGA SDK
- **exceljs** - Excel ファイル処理
- **xml2js** - XML パース
- **ejs** - テンプレート エンジン
- **inquirer** - インタラクティブ CLI
- **dotenv** - 環境変数管理

## 開発

### Pythonスクリプト

Matter XML仕様ファイルからデバイスタイプJSONを生成：

```bash
cd python
python parse-matter-devices-xml-to-json.py
```
`file/json/matter` に保存される