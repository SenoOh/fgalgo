# fgalgo
fgalgoは，OpenFGA の Authorization Model と Relationship Tuples を自動生成，自動更新するNode.jsツールである．
ExcelファイルやMatter仕様XMLファイルからユーザ属性とデバイス情報を読み取り，OpenFGAで使用可能な Authorization Model と Relationship Tuples を生成する．また，LLMを用いて自然言語からデバイスのアクセス制御ルールを更新する支援をする．

## 主な機能
- 自動生成機能
   - Excelファイルからのユーザ・デバイス情報の自動読み込み
   - Matter仕様XMLファイルの解析とデバイスタイプ，コマンドの組を生成
   - Authorization Model（.fga）の自動生成
   - Relationship Tuples の自動生成
   - OpenFGA サーバへの自動デプロイ
   - インタラクティブなデバイス権限設定

- 自動更新機能
   - OpenFGA サーバからの Authorization Model と Relationship Tuples の取得・保存
   - 既存データの統計分析とサマリー表示（ユーザ数、デバイス数、グループ数、権限関係など）
   - インタラクティブCLIによるユーザ・デバイス・グループの管理
   - LLM（Gemini API）を活用した自然言語による権限変更
   - OpenFGA への変更の自動適用

## 必要な環境

- Node.js (v18以上推奨)
- python3
- OpenFGA CLI (`fga` コマンド)
- OpenFGA サーバ (docker上で構築)

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
GEMINI_API_KEY=your-gemini-api-key
```

### 4. OpenFGA サーバの環境構築
OpenFGA を Docker で立ち上げる
```bash
docker compose up -d
```

### 5. 入力ファイルの準備

以下のファイルを適切なディレクトリに配置する：

#### デバイス関連
- `matter_xml/` - Matter仕様XMLファイル群

#### 設定ファイル関連
- `user_groups.xlsx` - ユーザグループ定義
- `user_attributes.xlsx` - ユーザ属性
- `device_attributes.xlsx` - デバイス属性

設定ファイル関連の形式例は以下である：

#### ユーザグループ (user_groups.xlsx)
##### 形式
| 通番 | 項目 | 内容 | 型 |
|-----|------|------------|------|
| 1 | id | ID | int |
| 2 | uid | 一意なグループ ID | string |
| 3 | name | 人間が識別可能な名称 | string |
| 4 | parent | 親階層グループ名 | string / null |


##### 例
|id| uid | name | parent |
|--|-----|------|-------|
|1| teacher | 先生のグループ |  |
|2| doctor | 博士課程学生のグループ | teacher |

#### ユーザ属性 (user_attributes.xlsx)
##### 形式
| 通番 | 項目 | 内容 | 型 |
|-----|------|------------|------|
| 1 | id | ID | int |
| 2 | uid | 一意なユーザ ID | string |
| 3 | name | 人間が識別可能な名称 | string |
| 4 | group | 所属グループ | array of string / null |
| 5 | room | 所属部屋 | array of string / null |

##### 例

|id | uid | name | group | room |
|---|-----|------|-------|------|
| 1 | tanaka | 田中太郎 | teacher | room101, room102 |
| 2 | sato | 佐藤花子 | doctor | room102 |

#### デバイス属性 (device_attributes.xlsx)
##### 形式
| 通番 | 項目 | 内容 | 型 |
|-----|------|------------|------|
| 1 | id | ID | int |
| 2 | uid | 一意なデバイス ID | string |
| 3 | name | 人間が識別可能な名称 | string |
| 4 | type | デバイスタイプ | string |
| 5 | room | 所属部屋 | array of string / null |


##### 例
| uid | name | type | room |
|-----|------|------|----------|
| light101 | 101号室の照明 | onofflightswitch | room101 |
| lock102 | 102号室のスマートロック | doorlock | room102 |

## 使用方法

### 基本的な実行

```bash
node main.js
```

実行時に `create`（自動生成）または `update`（自動更新）を選択する

### 自動生成モードの実行

自動生成モードでは，ExcelファイルとMatter仕様XMLファイルから新しいAuthorization ModelとRelationship Tuplesを生成し，OpenFGAにデプロイする．

#### 必要な入力ファイル

自動生成モードを実行する前に，以下のファイルを準備する：

**ユーザ関連（Excelファイル）**
- `user_groups.xlsx` - ユーザグループ定義
- `user_attributes.xlsx` - ユーザ属性

**デバイス関連**
- `device_attributes.xlsx` - デバイス属性
- `matter_xml/` - Matter仕様XMLファイル群
- `file/json/matter/devicetype.json` - デバイスタイプ定義（Pythonスクリプトで生成）

#### 実行フロー

1. **ユーザ情報の処理**
   - Excelファイルからユーザグループとユーザ属性を読み込み
   - ユーザ用 Authorization Model を生成
   - ユーザ用 Relationship Tuples を生成

2. **デバイス情報の処理**
   - MatterデバイスタイプをJSONから読み込み
   - デバイス属性をExcelから読み込み
   - インタラクティブなデバイス設定（権限，アクション）
   - デバイス用 Authorization Model を生成
   - デバイス用 Relationship Tuples を生成

3. **OpenFGAへのデプロイ**
   - 統合された Authorization Model をOpenFGAサーバに送信
   - すべての Relationship Tuples をアップロード


### 自動更新モードの実行

自動更新モードでは，既に OpenFGA に登録されているデータを取得し，対話的に管理・更新できる．

#### 実行フロー

1. **データ取得と保存**
   - OpenFGA サーバから現在の Authorization Model を取得
   - OpenFGA サーバから現在の Relationship Tuples を取得（ページネーション対応）
   - 取得したデータを `./file/update/model.fga` と `./file/update/tuple.json` に保存

2. **統計分析と表示**
   - ユーザ，デバイス，グループ，部屋の統計情報を自動分析
   - 各エンティティの数，権限関係，アクティブなリレーションを表示
   - デバイスタイプごとの集計情報を表示

3. **対話モード**
   - メインメニューから管理したい項目を選択（ユーザ/デバイス/グループ）
   - 自然言語で権限変更の要求を入力
   - LLM が要求を解析し，実行プランを生成
   - 生成されたプランを確認・承認
   - OpenFGA への変更を自動適用

#### LLMを活用した権限変更

自動更新モードでは，Gemini API を使用して自然言語から権限変更を実行できる．


**使用例**

```
自然言語による要求例:
- 「田中さんに101号室のドアロックへのアクセス権を付与してください」
- 「佐藤さんの全てのデバイス権限を削除してください」
- 「doctor グループに room102 の全デバイスへの admin 権限を付与してください」
```

LLMは以下の処理を自動的に実行する：
1. 要求の解析と構造化
2. 現在のデータとの整合性確認
3. 必要な変更の実行プラン生成
4. Authorization Model と Relationship Tuples の更新内容生成


## プロジェクト構造

```
fgalgo/
├── main.js                 # メインエントリーポイント
├── package.json           
├── .env                   # 環境変数設定
├── src/                   # ソースコード
│   ├── create/           # 自動生成機能
│   │   ├── user/         # ユーザ関連処理
│   │   ├── device/       # デバイス関連処理
│   │   ├── export/       # FGAエクスポート処理
│   │   └── util/         # ユーティリティ関数
│   └── update/           # 自動更新機能
│       ├── api/          # OpenFGA API クライアント
│       ├── cli/          # インタラクティブCLI
│       └── llm/          # LLM統合（Gemini）
├── file/                 # 入力・テンプレートファイル
│   ├── template/         # EJSテンプレート
│   ├── model/            # FGAモデルファイル（自動生成用）
│   ├── update/           # 自動更新用ファイル
│   │   ├── model.fga     # 取得した Authorization Model
│   │   ├── tuple.json    # 取得した Relationship Tuples
│   │   ├── update_model.fga    # 更新版 Model（LLM生成）
│   │   └── update_tuple.json   # 更新版 Tuples（LLM生成）
│   └── json/             # JSONデータファイル
├── matter_xml/           # Matter仕様XMLファイル
└── python/               # Python補助スクリプト
```




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