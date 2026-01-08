/**
 * LLM分析用プロンプトテンプレート
 * OpenFGA権限管理のための自然言語処理
 */

/**
 * 包括的分析プロンプト - ユーザの意図を理解する
 */
export const COMPREHENSIVE_ANALYSIS_PROMPT = `
あなたはOpenFGAアクセス制御システムの専門家です．
ユーザの自然言語入力を分析し，何をしたいのかを理解してください．

**分析観点:**
1. **行動の種類**: 追加(ADD), 削除(REMOVE), 変更(MODIFY), 確認(CHECK)，またはその他の操作
2. **対象リソース**: ユーザ，デバイス，グループのいずれか
3. **権限の種類**: 具体的な権限名（can_unlock_door, member, parent等）
4. **信頼度**: 意図理解の確信度（0.0-1.0）

**JSON出力形式の重要な注意事項:**
⚠️ JSON文字列値内には，以下を含めないでください：
- バッククォート（\`）やコードブロック（\`\`\`）
- マークダウン記法
- 複数行のコード例
代わりに，簡潔なプレーンテキストのみを使用してください．

**出力形式 (JSON):**
{
  "intent": "操作の種類（ADD/REMOVE/MODIFY/CHECK等）",
  "confidence": 0.0-1.0,
  "action": "具体的な操作内容（簡潔なプレーンテキストのみ）",
  "target": "対象リソース",
  "permission": "権限名",
  "reasoning": "判断理由（簡潔なプレーンテキストのみ．波括弧，引用符禁止）"
}

**重要な出力制約:**
- すべての文字列フィールドには以下を**絶対に含めないでください**：
  * 波括弧 { }
  * ダブルクォート " （文字列の区切り以外）
- 代わりに，自然言語の説明のみを使用してください

**入力:**
リソースタイプ: {resourceType}
リソースID: {resourceId}
現在の状態: {currentState}
ユーザ入力: "{userInput}"

上記を分析してJSONで応答してください．
`;

/**
 * 自然言語→JSON変換プロンプト - OpenFGA操作を生成
 */
export const NATURAL_LANGUAGE_TO_JSON_PROMPT = `
OpenFGAのRelationship Tuplesを管理する専門家として，
分析結果を具体的なOpenFGA操作に変換してください．

**重要:** 必ず1つ以上のTuple操作を生成してください．

**既存Tupleの確認を必須とする:**
⚠️ DELETE操作やUPDATE操作を行う場合は，**必ず現在のOpenFGAコンテキストに記載されている既存のRelationship Tuplesを確認**してください．
存在しないTupleを削除することはできません．

**例: wakameからcan_LockDoor権限を剥奪する場合の正しい判断:**
現在のTuples:
- {"user": "user:wakame", "relation": "admin", "object": "doorlock:xxx"} ← 存在する

この場合，wakameはadmin経由でcan_LockDoorを持っているため：
✅ **正解:** adminリレーションを削除
  {"user": "user:wakame", "relation": "admin", "object": "doorlock:xxx"} を DELETE

❌ **誤り:** 存在しないcan_LockDoorリレーションを削除しようとする
  {"user": "user:wakame", "relation": "can_LockDoor", "object": "doorlock:xxx"} を DELETE
  ↑ このTupleは存在しないため削除できない

**最小権限の原則の厳守:**
⚠️ ユーザに特定の権限（例: can_UnlockDoor）を付与する場合，
既存のロール（admin, junior等）を付与するのではなく，
**要求された権限を直接付与**してください．

❌ **誤り:** adminロールを付与
  {"user": "user:A", "relation": "admin", "object": "doorlock:xxx"}

✅ **正解:** 必要な権限のみを直接付与
  {"user": "user:A", "relation": "can_UnlockDoor", "object": "doorlock:xxx"}
  {"user": "user:A", "relation": "can_LockDoor", "object": "doorlock:xxx"}

**🚨 relation項目の厳格な制約:**
⚠️ **Authorization Modelに登録されているrelationのみを使用してください！**
- Tuple操作のrelationフィールドには，現在のOpenFGAコンテキストに記載されているAvailableRelationsに含まれるrelationのみを指定できます
- Authorization Modelに存在しないrelationを使用すると，OpenFGA APIでエラーが発生します
- 使用可能なrelationは，コンテキストのavailableRelationsフィールドで確認してください
- **⚠️ 大文字小文字を厳密に一致させてください！** can_On と can_on は異なるrelationです

**🔤 relation命名規則（重要）:**
- can_〇〇 形式のrelation名は，devicetype.jsonのattribute名やcommands名に "can_" を付与したものです
- commands名の大文字小文字がそのまま継承されます
- 例: commands: "On" → relation: "can_On" （Oは大文字）
- 例: commands: "Off" → relation: "can_Off" （Oは大文字）
- 例: commands: "LockDoor" → relation: "can_LockDoor" （キャメルケース）
- 例: commands: "UnlockDoor" → relation: "can_UnlockDoor" （キャメルケース）

したがって，推測で relation名を生成してはいけません！
必ずavailableRelationsで確認した正確な名前を使用してください．

例: onofflightswitchタイプで使用可能なrelation
- admin 使用可能
- can_On 使用可能（commands: "On" から生成）
- can_Off 使用可能（commands: "Off" から生成）
- can_on 使用禁止（commands に "on" は存在しない）
- can_off 使用禁止（commands に "off" は存在しない）
- onoff_permission 使用禁止（Authorization Modelに存在しない場合）

**OpenFGA操作の種類:**
- CREATE: 新しい関係性を作成
- DELETE: 既存の関係性を削除
- UPDATE: 関係性の更新（削除→作成の組み合わせ）
- その他，状況に応じた操作タイプを指定可能

**Tuple形式:**
{
  "user": "user:ユーザID",
  "relation": "関係名",
  "object": "type:オブジェクトID"
}

**例: ユーザAにdoorlockの解錠・施錠権限を付与する場合:**
[
  {
    "type": "CREATE",
    "tuple": {
      "user": "user:A",
      "relation": "can_UnlockDoor",
      "object": "doorlock:doorlockXXX"
    },
    "description": "ユーザAにdoorlockXXXの解錠権限を直接付与"
  },
  {
    "type": "CREATE",
    "tuple": {
      "user": "user:A",
      "relation": "can_LockDoor",
      "object": "doorlock:doorlockXXX"
    },
    "description": "ユーザAにdoorlockXXXの施錠権限を直接付与"
  }
]

**完全な実例1: onofflightswitchデバイスへの権限付与**

要求: ユーザAにonofflightswitch:light101のON/OFF権限を付与

Authorization Modelの現在の設定:
  define can_On: admin
  define can_Off: admin

操作:
[
  {
    "type": "CREATE",
    "tuple": {
      "user": "user:A",
      "relation": "can_On",
      "object": "onofflightswitch:light101"
    },
    "description": "ユーザAにlight101のON権限を直接付与"
  },
  {
    "type": "CREATE",
    "tuple": {
      "user": "user:A",
      "relation": "can_Off",
      "object": "onofflightswitch:light101"
    },
    "description": "ユーザAにlight101のOFF権限を直接付与"
  }
]

注意: can_Onとcan_Offは大文字のOで，can_onやcan_offではありません
理由: relation名 "can_〇〇" は devicetype.jsonのattribute名やcommands名に "can_" を付与したもの
     commands: "On" → relation: "can_On" （大文字小文字がそのまま継承される）

**完全な実例2: 権限剥奪（DELETE操作）**

要求: ユーザBからdoorlock:door202のadmin権限を剥奪

現在のTuples（確認必須）:
  {"user": "user:B", "relation": "admin", "object": "doorlock:door202"} ← 存在する

操作:
[
  {
    "type": "DELETE",
    "tuple": {
      "user": "user:B",
      "relation": "admin",
      "object": "doorlock:door202"
    },
    "description": "ユーザBからdoor202のadmin権限を剥奪"
  }
]

❌ 誤った例: 存在しないcan_LockDoorを削除しようとする
  {"user": "user:B", "relation": "can_LockDoor", "object": "doorlock:door202"}
理由: ユーザBはcan_LockDoorを直接持っておらず，admin経由で持っている

**JSON出力形式の重要な注意事項:**
⚠️ JSON文字列値内には，以下を含めないでください：
- バッククォート（\`）やコードブロック（\`\`\`）
- マークダウン記法
- 複数行のコード例
代わりに，簡潔なプレーンテキストのみを使用してください．

**出力形式 (JSON):**
{
  "operations": [
    {
      "type": "操作タイプ（CREATE/DELETE/UPDATE等）",
      "tuple": {
        "user": "...",
        "relation": "...",
        "object": "..."
      },
      "description": "操作の説明（簡潔なプレーンテキストのみ）"
    }
  ],
  "summary": "操作の要約（簡潔なプレーンテキストのみ）",
  "warnings": ["注意事項（プレーンテキストのみ．波括弧，引用符，Tuple表記禁止）"]
}

**重要な出力制約:**
- warnings配列には以下を**絶対に含めないでください**：
  * 波括弧 { }
  * ダブルクォート " （文字列の区切り以外）
  * Tuple表記（例: {user: ..., relation: ..., object: ...}）
- 代わりに，自然言語の説明のみを使用してください

**入力分析結果:**
{analysisResult}

**現在のOpenFGAコンテキスト:**
{context}

上記を基にOpenFGA操作をJSONで生成してください．
operationsは必ず1つ以上含めてください．
**重要:** 
- relationフィールドには，要求された具体的な権限名（can_UnlockDoor等）を指定し，admin等の上位ロールは使用しないでください．
- **relationフィールドには，コンテキストのavailableRelationsに含まれるrelationのみを使用してください．存在しないrelationは使用禁止です．**
`;

/**
 * Authorization Model解析プロンプト - モデル変更の必要性を判断
 */
export const AUTHORIZATION_MODEL_ANALYSIS_PROMPT = `
OpenFGAのAuthorization Model変更の必要性を分析してください．

**重要な設計方針:**
⚠️ **新しいロール（relation）を作成してはいけません！**
既存のロール（admin, junior, guest等）とは独立して，特定のユーザにのみ権限を付与する場合は，
以下のアプローチを使用してください：

**正しいアプローチ:**
例: 「Aさんに doorlock の can_UnlockDoor 権限を与えたい」という要求の場合

❌ **誤り:** 新しいロール "door_operator" を作成
✅ **正解:** 既存の定義に [user] を追加

現在: \`define can_UnlockDoor: admin\`
変更後: \`define can_UnlockDoor: [user] or admin\`

そして，Relationship Tuplesで:
\`{"user":"user:A", "relation":"can_UnlockDoor", "object":"doorlock:xxx"}\`

**完全な実例1: onofflightswitchデバイスへの権限付与**

要求: ユーザAにonofflightswitch:light101のON/OFF権限を付与したい

現在のAuthorization Model:
  type onofflightswitch
    relations
      define can_On: admin
      define can_Off: admin

✅ 正しい変更手順:

Step 1: Authorization Modelを変更
  type onofflightswitch
    relations
      define can_On: [user] or admin
      define can_Off: [user] or admin

Step 2: Relationship Tuplesを追加
  {"user": "user:A", "relation": "can_On", "object": "onofflightswitch:light101"}
  {"user": "user:A", "relation": "can_Off", "object": "onofflightswitch:light101"}

結果: ユーザAはlight101を直接ON/OFF可能（adminロール不要）

❌ 避けるべき誤った方法:
  {"user": "user:A", "relation": "admin", "object": "onofflightswitch:light101"}
理由: adminは can_AddScene, can_RemoveScene など多くの不要な権限も含む

**完全な実例2: doorlockデバイスへの権限付与**

要求: ユーザBにdoorlock:door202の施錠/解錠権限を付与したい

現在のAuthorization Model:
  type doorlock
    relations
      define can_LockDoor: admin
      define can_UnlockDoor: admin

✅ 正しい変更手順:

Step 1: Authorization Modelを変更
  type doorlock
    relations
      define can_LockDoor: [user] or admin
      define can_UnlockDoor: [user] or admin

Step 2: Relationship Tuplesを追加
  {"user": "user:B", "relation": "can_LockDoor", "object": "doorlock:door202"}
  {"user": "user:B", "relation": "can_UnlockDoor", "object": "doorlock:door202"}

結果: ユーザBはdoor202を直接施錠/解錠可能（adminロール不要）

**完全な実例3: 権限剥奪（DELETE操作）**

要求: ユーザCからonofflightswitch:light303のadmin権限を剥奪したい

現在のTuples:
  {"user": "user:C", "relation": "admin", "object": "onofflightswitch:light303"}

✅ 正しい操作:

Step 1: Authorization Model変更は不要（既存の定義で対応可能）

Step 2: Relationship Tupleを削除
  DELETE {"user": "user:C", "relation": "admin", "object": "onofflightswitch:light303"}

結果: ユーザCはlight303のadmin権限を失う

❌ 避けるべき誤り: 存在しないTupleを削除しようとする
  DELETE {"user": "user:C", "relation": "can_On", "object": "onofflightswitch:light303"}
理由: ユーザCは can_On を直接持っておらず，admin経由で持っている

**分析観点:**
1. **現在のモデル適合性**: 要求される操作が現在のモデルで実現可能か
2. **[user]の追加**: 特定ユーザへの直接権限付与が必要か
3. **設計原則**: 最小権限の原則（既存ロールへの所属より直接権限付与が適切）
4. **拡張性**: 将来的な権限管理の柔軟性

**判断基準:**
- 現在の定義に [user] が含まれていない → [user] を追加
- 既存の関係性（admin, junior等）経由が冗長 → 直接権限付与を検討
- 新しいロールの作成は避ける → 既存定義の拡張で対応

**JSON出力形式の重要な注意事項:**
⚠️ JSON文字列値内には，以下を含めないでください：
- バッククォート（\`）やコードブロック（\`\`\`）
- マークダウン記法
- 複数行のコード例
代わりに，簡潔なプレーンテキストのみを使用してください．

**出力形式 (JSON):**
{
  "modelChangeRequired": true|false,
  "analysis": {
    "currentDefinition": "現在の定義（簡潔なプレーンテキストのみ．波括弧，引用符，コードブロック禁止）",
    "canBeExpressedWithCurrentModel": true|false,
    "recommendedApproach": "推奨されるアプローチの説明（簡潔なプレーンテキストのみ．波括弧，引用符，コードブロック禁止）",
    "reasoning": "判断理由（簡潔なプレーンテキストのみ．波括弧，引用符，コードブロック禁止）"
  },
  "proposedChanges": {
    "resourceType": "リソースタイプ",
    "relation": "権限名",
    "currentDefinition": "現在の定義（例: admin）",
    "newDefinition": "提案する新定義（例: [user] or admin）",
    "changeDescription": "変更内容の説明（簡潔なプレーンテキストのみ）",
    "changeReason": "変更理由（簡潔なプレーンテキストのみ）"
  } | null
}

**重要な出力制約:**
- すべての文字列フィールド（特にanalysisセクション）には以下を**絶対に含めないでください**：
  * 波括弧 { }
  * ダブルクォート " （文字列の区切り以外）
  * バッククォート \` やコードブロック \`\`\`
  * Tuple表記やJSONオブジェクト表記
- 代わりに，自然言語の説明のみを使用してください

**入力データ:**
リソースタイプ: {resourceType}
対象リソース: {resourceId}
要求される操作: {requestedOperation}
現在のAuthorization Model: {authorizationModel}
ユーザ入力: "{userInput}"

上記を分析してJSONで応答してください．
`;

/**
 * 権限検証プロンプト - 操作の妥当性をチェック
 */
export const VALIDATE_PERMISSIONS_PROMPT = `
OpenFGAセキュリティ専門家として，提案された操作の妥当性を検証してください．

**検証観点:**
1. **セキュリティリスク**: 不適切な権限昇格の可能性
2. **整合性**: OpenFGAモデルとの整合性
3. **ベストプラクティス**: 推奨される権限設計との適合性
4. **副作用**: 他のリソースへの影響

**出力形式 (JSON):**
{
  "isValid": true|false,
  "riskLevel": "リスクレベル（LOW/MEDIUM/HIGH/CRITICAL等）",
  "issues": ["問題点のリスト"],
  "recommendations": ["推奨事項"],
  "approved": true|false,
  "reasoning": "判断理由"
}

**提案された操作:**
{operations}

**OpenFGAコンテキスト:**
{context}

上記操作の妥当性をJSONで評価してください．
`;

/**
 * 統合操作生成プロンプト - Authorization ModelとTuple操作を統合
 */
export const INTEGRATED_OPERATIONS_PROMPT = `
OpenFGAの専門家として，Authorization Model変更とRelationship Tuple操作を統合した実行計画を作成してください．

**重要な設計方針:**
⚠️ **新しいロール（relation）を作成しないでください！**
既存の権限定義を拡張する方式で対応してください．

⚠️ **tupleOperations は必ず含めてください！**
Tuple操作結果（{tupleOperations}）に含まれる操作をそのまま含めてください．

⚠️ **最小権限の原則を厳守してください！**
tupleOperationsでは，要求された具体的な権限（can_UnlockDoor等）を直接付与し，
admin等の上位ロールを付与しないでください．

⚠️ **既存Tupleの確認を必須とする！**
DELETE操作を行う場合は，{tupleOperations}および{context}に記載されている
**実際に存在するRelationship Tuples**のみを削除してください．
存在しないTupleを削除することはできません．

**既存Tuple確認の例:**
現在のTuples（{context}.currentTuples）:
  {"user": "user:wakame", "relation": "admin", "object": "doorlock:doorlockKidsRoom"}

この状態でwakameの権限を剥奪する場合：
✅ **正解:** 実際に存在するadminリレーションを削除
  DELETE {"user": "user:wakame", "relation": "admin", "object": "doorlock:doorlockKidsRoom"}

❌ **誤り:** 存在しないcan_UnlockDoorリレーションを削除しようとする
  DELETE {"user": "user:wakame", "relation": "can_UnlockDoor", "object": "doorlock:doorlockKidsRoom"}
  ↑ このTupleは存在しない（wakameはadmin経由で権限を持っている）

**正しいTuple操作の例:**
✅ 特定権限の直接付与:
  {"user": "user:namihei", "relation": "can_UnlockDoor", "object": "doorlock:doorlockKidsRoom"}
  {"user": "user:namihei", "relation": "can_LockDoor", "object": "doorlock:doorlockKidsRoom"}

❌ 上位ロールの付与（避けるべき）:
  {"user": "user:namihei", "relation": "admin", "object": "doorlock:doorlockKidsRoom"}

**🚨 relation項目の厳格な制約:**
⚠️ **Tuple操作では，Authorization Modelに登録されているrelationのみを使用してください！**
- tupleOperationsのrelationフィールドには，Authorization Modelに定義されているrelationのみを指定できます
- 直前のモデル変更（modelChanges）で新しいrelationを追加した場合は，そのrelationも使用可能です
- Authorization Modelに存在しないrelationを使用すると，OpenFGA APIでエラーが発生します
- **⚠️ 大文字小文字を厳密に一致させてください！** can_On と can_on は異なるrelationです

**🔤 relation命名規則（重要）:**
- can_〇〇 形式のrelation名は，devicetype.jsonのattribute名やcommands名に "can_" を付与したものです
- commands名の大文字小文字がそのまま継承されます
- 例: commands: "On" → relation: "can_On" （Oは大文字）
- 例: commands: "Off" → relation: "can_Off" （Oは大文字）
- 例: commands: "LockDoor" → relation: "can_LockDoor" （キャメルケース）
- 例: commands: "UnlockDoor" → relation: "can_UnlockDoor" （キャメルケース）

したがって，推測で relation名を生成してはいけません！
必ず現在のAuthorization Modelで確認した正確な名前を使用してください．

**relationの検証手順:**
1. tupleOperationsで使用するrelationが，現在のAuthorization Modelに存在するか確認
2. **大文字小文字を含めて完全一致していることを確認**（can_On ≠ can_on）
3. 存在しない，または大文字小文字が一致しない場合は，modelChangesで追加/修正する必要があります
4. modelChangesでも追加していない場合は，そのrelationは使用できません

例: 新しいrelationを使用する正しい手順
- Step 1: modelChangesで "onoff_permission" relationを追加
- Step 2: tupleOperationsで "onoff_permission" を使用（完全一致）

例: 大文字小文字の厳密な一致が必要
- Authorization Modelに "can_On" が定義されている場合:
  ✅ 正解: "can_On" を使用（commands: "On" から生成されたもの）
  ❌ 誤り: "can_on" を使用（commands に "on" は存在しない → OpenFGA APIでエラー）

**実行順序:**
1. Authorization Model変更（必要な場合）
2. Relationship Tuple操作（直接権限付与） ← **必須**

**Authorization Model変更の例:**

例1: [user]の追加
- 変更前: \`define can_UnlockDoor: admin\`
- 変更後: \`define can_UnlockDoor: [user] or admin\`
- 説明: 特定ユーザへの直接権限付与を可能にする

例2: 新しい計算済みリレーションの追加
- 変更前: なし（新規）
- 変更後: \`define viewer: [user] or member\`
- 説明: 閲覧権限の新規定義

例3: TTU（Tuple to Userset）の追加
- 変更前: \`define can_view: admin\`
- 変更後: \`define can_view: admin or viewer from parent\`
- 説明: 親リソースからの権限継承を追加

**完全な変更例（onofflightswitch デバイスの場合）:**

シナリオ: ユーザAにonofflightswitch:light101のON/OFF権限を付与

現在のAuthorization Model:
  type onofflightswitch
    relations
      define can_On: admin
      define can_Off: admin

Step 1: Authorization Model変更
  type onofflightswitch
    relations
      define can_On: [user] or admin
      define can_Off: [user] or admin

Step 2: Relationship Tuples追加
  {"user": "user:A", "relation": "can_On", "object": "onofflightswitch:light101"}
  {"user": "user:A", "relation": "can_Off", "object": "onofflightswitch:light101"}

結果: ユーザAはlight101を直接操作可能（adminロール不要）

**完全な変更例（doorlock デバイスの場合）:**

シナリオ: ユーザBにdoorlock:door202の施錠/解錠権限を付与

現在のAuthorization Model:
  type doorlock
    relations
      define can_LockDoor: admin
      define can_UnlockDoor: admin

Step 1: Authorization Model変更
  type doorlock
    relations
      define can_LockDoor: [user] or admin
      define can_UnlockDoor: [user] or admin

Step 2: Relationship Tuples追加
  {"user": "user:B", "relation": "can_LockDoor", "object": "doorlock:door202"}
  {"user": "user:B", "relation": "can_UnlockDoor", "object": "doorlock:door202"}

結果: ユーザBはdoor202を直接操作可能（adminロール不要）

**誤った例（避けるべき）:**

❌ adminロールを付与する方法:
  {"user": "user:A", "relation": "admin", "object": "onofflightswitch:light101"}
理由: adminは他の多くの権限（can_AddScene, can_RemoveScene等）も含むため過剰

✅ 正しい方法: 必要な権限のみを直接付与
  {"user": "user:A", "relation": "can_On", "object": "onofflightswitch:light101"}
  {"user": "user:A", "relation": "can_Off", "object": "onofflightswitch:light101"}

**Tuple操作の例:**
{
  "type": "CREATE",
  "tuple": {
    "user": "user:namihei",
    "relation": "can_UnlockDoor",
    "object": "doorlock:doorlockKidsRoom"
  },
  "description": "ユーザnamiheiにdoorlockKidsRoomの解錠権限を直接付与"
}

**JSON出力形式の重要な注意事項:**
⚠️ JSON文字列値内には，以下を含めないでください：
- バッククォート（\`）やコードブロック（\`\`\`）
- マークダウン記法
- 複数行のコード例
代わりに，簡潔なプレーンテキストのみを使用してください．

**出力形式 (JSON):**
{
  "executionPlan": {
    "hasModelChanges": true|false,
    "hasTupleOperations": true|false,
    "totalSteps": 数値
  },
  "modelChanges": [
    {
      "type": "MODIFY_RELATION_DEFINITION",
      "resourceType": "リソースタイプ",
      "relation": "権限名",
      "currentDefinition": "現在の定義（例: admin，またはnullで新規追加）",
      "newDefinition": "新しい定義（例: [user] or admin）",
      "changeDescription": "変更内容の簡潔な説明",
      "reason": "変更理由（なぜこの変更が必要か）"
    }
  ] | [],
  "tupleOperations": [
    {
      "type": "操作タイプ（CREATE/DELETE/UPDATE等）",
      "tuple": {
        "user": "...",
        "relation": "...",
        "object": "..."
      },
      "description": "操作の説明"
    }
  ],
  "summary": "実行計画の要約（簡潔に）",
  "warnings": ["注意事項（プレーンテキストのみ．波括弧，引用符，Tuple表記禁止）"],
  "rollbackInstructions": "失敗時のロールバック手順（プレーンテキストのみ．波括弧，引用符，Tuple表記禁止）"
}

**重要な出力制約:** 
- tupleOperations配列には必ず{tupleOperations}の内容を含めてください
- **tupleOperations.tuple.relationには，Authorization Modelに存在するrelationのみを使用してください**
  * 現在のAuthorization Modelに定義されているrelation
  * または，modelChangesで新たに追加するrelation
  * 上記以外のrelationは使用禁止です
- modelChanges.typeは常に "MODIFY_RELATION_DEFINITION" を使用してください
- warnings配列とrollbackInstructionsフィールドには以下を**絶対に含めないでください**：
  * 波括弧 { } 
  * ダブルクォート " （文字列の区切り以外）
  * Tuple表記（例: {user: ..., relation: ..., object: ...}）
  * JSONオブジェクト表記
- 代わりに，自然言語の説明のみを使用してください（例: 「ユーザーkatsuoのadminリレーションを削除」）

**入力データ:**
モデル分析結果: {modelAnalysis}
Tuple操作結果: {tupleOperations}
OpenFGAコンテキスト: {context}

上記を基に統合実行計画をJSONで生成してください．
`;

/**
 * プロンプト構築ユーティリティクラス
 */
export class PromptBuilder {
  /**
   * 包括的分析プロンプトを構築
   * @param {string} userInput - ユーザ入力
   * @param {string} resourceType - リソースタイプ
   * @param {Object} resourceData - リソースデータ
   * @param {Object} context - OpenFGAコンテキスト
   * @returns {string} 構築されたプロンプト
   */
  static buildComprehensiveAnalysisPrompt(userInput, resourceType, resourceData, context) {
    const currentState = this.formatCurrentState(resourceType, resourceData);
    
    return COMPREHENSIVE_ANALYSIS_PROMPT
      .replace('{resourceType}', resourceType)
      .replace('{resourceId}', resourceData.id)
      .replace('{currentState}', currentState)
      .replace('{userInput}', userInput);
  }

  /**
   * 自然言語→JSON変換プロンプトを構築
   * @param {Object} analysisResult - 分析結果
   * @param {Object} context - OpenFGAコンテキスト
   * @returns {string} 構築されたプロンプト
   */
  static buildNaturalLanguageToJsonPrompt(analysisResult, context) {
    // コンテキストに既存Tuplesの説明を追加
    const enhancedContext = {
      ...context,
      _note: "DELETE操作を行う場合は，必ずcurrentTuples配列に存在するTupleのみを削除してください"
    };
    
    return NATURAL_LANGUAGE_TO_JSON_PROMPT
      .replace('{analysisResult}', JSON.stringify(analysisResult, null, 2))
      .replace('{context}', JSON.stringify(enhancedContext, null, 2));
  }

  /**
   * Authorization Model解析プロンプトを構築
   * @param {string} userInput - ユーザ入力
   * @param {string} resourceType - リソースタイプ
   * @param {string} resourceId - リソースID
   * @param {string} requestedOperation - 要求される操作
   * @param {Object} authorizationModel - Authorization Model
   * @returns {string} 構築されたプロンプト
   */
  static buildAuthorizationModelAnalysisPrompt(userInput, resourceType, resourceId, requestedOperation, authorizationModel) {
    return AUTHORIZATION_MODEL_ANALYSIS_PROMPT
      .replace('{resourceType}', resourceType)
      .replace('{resourceId}', resourceId)
      .replace('{requestedOperation}', requestedOperation)
      .replace('{authorizationModel}', JSON.stringify(authorizationModel, null, 2))
      .replace('{userInput}', userInput);
  }

  /**
   * 統合操作プロンプトを構築
   * @param {Object} modelAnalysis - モデル分析結果
   * @param {Object} tupleOperations - Tuple操作結果
   * @param {Object} context - OpenFGAコンテキスト
   * @returns {string} 構築されたプロンプト
   */
  static buildIntegratedOperationsPrompt(modelAnalysis, tupleOperations, context) {
    // コンテキストに既存Tuplesの説明を追加
    const enhancedContext = {
      ...context,
      _important: "DELETE操作を実行する際は，必ずcurrentTuples配列に記載されている実際に存在するTupleのみを削除対象としてください．存在しないTupleは削除できません．"
    };
    
    return INTEGRATED_OPERATIONS_PROMPT
      .replace('{modelAnalysis}', JSON.stringify(modelAnalysis, null, 2))
      .replace('{tupleOperations}', JSON.stringify(tupleOperations, null, 2))
      .replace('{context}', JSON.stringify(enhancedContext, null, 2));
  }

  /**
   * 権限検証プロンプトを構築
   * @param {Object} operations - OpenFGA操作
   * @param {Object} context - OpenFGAコンテキスト
   * @returns {string} 構築されたプロンプト
   */
  static buildValidatePermissionsPrompt(operations, context) {
    return VALIDATE_PERMISSIONS_PROMPT
      .replace('{operations}', JSON.stringify(operations, null, 2))
      .replace('{context}', JSON.stringify(context, null, 2));
  }

  /**
   * 現在の状態を読みやすい形式にフォーマット
   * @param {string} resourceType - リソースタイプ
   * @param {Object} resourceData - リソースデータ
   * @returns {string} フォーマットされた状態
   */
  static formatCurrentState(resourceType, resourceData) {
    let state = `ID: ${resourceData.id}\n`;
    
    if (resourceType === 'user') {
      state += `グループ: [${resourceData.groups.join(', ')}]\n`;
      state += `デバイス: [${resourceData.devices.join(', ')}]\n`;
    } else if (resourceType === 'device') {
      state += `タイプ: ${resourceData.type}\n`;
      state += `ユーザ: [${resourceData.users.join(', ')}]\n`;
    } else if (resourceType === 'group') {
      state += `メンバー: [${resourceData.members.join(', ')}]\n`;
    }
    
    state += `アクティブリレーション: [${resourceData.activeRelations.join(', ')}]\n`;
    
    if (resourceData.inactiveRelations && resourceData.inactiveRelations.length > 0) {
      state += `非アクティブリレーション: [${resourceData.inactiveRelations.join(', ')}]`;
    }
    
    return state;
  }

  /**
   * OpenFGAコンテキストを分析用に整理
   * @param {Object} authorizationModel - 認可モデル
   * @param {Array} relationshipTuples - 関係性タプル
   * @param {Object} statistics - 統計情報
   * @returns {Object} 整理されたコンテキスト
   */
  static prepareOpenFGAContext(authorizationModel, relationshipTuples, statistics) {
    return {
      model: {
        types: authorizationModel.type_definitions || [],
        version: authorizationModel.schema_version || "1.1"
      },
      currentTuples: relationshipTuples || [],
      statistics: {
        totalUsers: statistics.users.count,
        totalDevices: statistics.devices.count,
        totalGroups: statistics.groups.count,
        totalTuples: relationshipTuples ? relationshipTuples.length : 0
      },
      availableRelations: this.extractAvailableRelations(authorizationModel),
      deviceTypes: statistics.deviceTypes ? statistics.deviceTypes.items.map(dt => dt.type) : []
    };
  }

  /**
   * 認可モデルから利用可能な関係性を抽出
   * @param {Object} authorizationModel - 認可モデル
   * @returns {Array} 関係性のリスト
   */
  static extractAvailableRelations(authorizationModel) {
    const relations = [];
    
    if (authorizationModel.type_definitions) {
      authorizationModel.type_definitions.forEach(type => {
        if (type.relations) {
          Object.keys(type.relations).forEach(relation => {
            relations.push({
              type: type.type,
              relation: relation,
              definition: type.relations[relation]
            });
          });
        }
      });
    }
    
    return relations;
  }

  /**
   * 特定のリソースタイプと権限の現在の定義を取得
   * @param {Object} authorizationModel - 認可モデル
   * @param {string} resourceType - リソースタイプ
   * @param {string} relation - 権限名
   * @returns {string|null} 現在の定義
   */
  static getCurrentRelationDefinition(authorizationModel, resourceType, relation) {
    if (!authorizationModel.type_definitions) {
      return null;
    }

    const typeDefinition = authorizationModel.type_definitions.find(
      type => type.type === resourceType
    );

    if (!typeDefinition || !typeDefinition.relations || !typeDefinition.relations[relation]) {
      return null;
    }

    return typeDefinition.relations[relation];
  }

  /**
   * 権限定義を人間が読みやすい形式に変換
   * @param {Object} relationDefinition - 権限定義オブジェクト
   * @returns {string} 読みやすい形式の定義
   */
  static formatRelationDefinition(relationDefinition) {
    if (!relationDefinition) {
      return 'undefined';
    }

    // 文字列の場合はそのまま返す
    if (typeof relationDefinition === 'string') {
      return relationDefinition;
    }

    // OpenFGAの定義構造を解析
    try {
      // union: A or B
      if (relationDefinition.union) {
        return relationDefinition.union.child.map(child => 
          this.formatRelationChild(child)
        ).join(' or ');
      }

      // intersection: A and B
      if (relationDefinition.intersection) {
        return relationDefinition.intersection.child.map(child => 
          this.formatRelationChild(child)
        ).join(' and ');
      }

      // difference: A but not B
      if (relationDefinition.difference) {
        const base = this.formatRelationChild(relationDefinition.difference.base);
        const subtract = this.formatRelationChild(relationDefinition.difference.subtract);
        return `${base} but not ${subtract}`;
      }

      // computedUserset: 他のリレーションを参照
      if (relationDefinition.computedUserset) {
        return relationDefinition.computedUserset.relation;
      }

      // tupleToUserset: TTU (Tuple to Userset)
      if (relationDefinition.tupleToUserset) {
        const tupleset = relationDefinition.tupleToUserset.tupleset.relation;
        const computed = relationDefinition.tupleToUserset.computedUserset.relation;
        return `${computed} from ${tupleset}`;
      }

      // this: 直接割り当て
      if (relationDefinition.this) {
        return '[user]';
      }

      // その他の構造はJSON文字列として返す
      return JSON.stringify(relationDefinition, null, 2);
      
    } catch (error) {
      // エラー時はJSON文字列として返す
      return JSON.stringify(relationDefinition, null, 2);
    }
  }

  /**
   * リレーション定義の子要素をフォーマット
   * @param {Object} child - 子要素
   * @returns {string} フォーマットされた文字列
   */
  static formatRelationChild(child) {
    if (!child) return 'null';

    if (child.this) return '[user]';
    
    if (child.computedUserset) {
      return child.computedUserset.relation;
    }

    if (child.tupleToUserset) {
      const tupleset = child.tupleToUserset.tupleset.relation;
      const computed = child.tupleToUserset.computedUserset.relation;
      return `${computed} from ${tupleset}`;
    }

    if (child.union || child.intersection || child.difference) {
      return this.formatRelationDefinition(child);
    }

    return JSON.stringify(child);
  }

  /**
   * 要求される操作を構造化
   * @param {string} userInput - ユーザ入力
   * @param {string} resourceType - リソースタイプ
   * @param {Object} resourceData - リソースデータ
   * @returns {string} 構造化された操作記述
   */
  static structureRequestedOperation(userInput, resourceType, resourceData) {
    return `
対象: ${resourceType}:${resourceData.id}
要求: ${userInput}
現在の状態: ${this.formatCurrentState(resourceType, resourceData)}
    `.trim();
  }

  /**
   * 特定リソースに関連する既存Tuplesを抽出
   * @param {Array} relationshipTuples - 全てのRelationship Tuples
   * @param {string} resourceType - リソースタイプ
   * @param {string} resourceId - リソースID
   * @returns {Array} 関連するTuples
   */
  static extractRelatedTuples(relationshipTuples, resourceType, resourceId) {
    if (!relationshipTuples || relationshipTuples.length === 0) {
      return [];
    }

    const objectId = `${resourceType}:${resourceId}`;
    
    return relationshipTuples.filter(tuple => 
      tuple.key && tuple.key.object === objectId
    ).map(tuple => ({
      user: tuple.key.user,
      relation: tuple.key.relation,
      object: tuple.key.object
    }));
  }

  // ============================================
  // コンテキスト最適化メソッド群
  // LLM処理のトークン数と処理時間を削減するため，
  // 各ステージに必要な情報だけを抽出する
  // ============================================

  /**
   * 意図分析用の軽量コンテキストを生成
   * @param {Object} context - 完全なOpenFGAコンテキスト
   * @returns {Object} 最適化されたコンテキスト
   */
  static optimizeContextForIntentAnalysis(context) {
    const resourceId = context.resourceId || context.resourceData?.id;
    
    // resourceIdが存在しない場合の安全な処理
    if (!resourceId) {
      return {
        resourceType: context.resourceType,
        resourceId: null,
        relevantTuples: [],
        tupleCount: context.currentTuples?.length || 0
      };
    }
    
    // 型プレフィックスなしのIDで比較
    const plainResourceId = resourceId.includes(':') 
      ? resourceId.split(':')[1] 
      : resourceId;
    
    // 関連するTupleのみを抽出（最大10件）
    const relevantTuples = context.currentTuples
      ?.filter(t => {
        // objectフィールドから型プレフィックスなしのIDを抽出
        const tupleObjectId = t.key?.object?.includes(':')
          ? t.key.object.split(':')[1]
          : t.key?.object;
        return tupleObjectId === plainResourceId;
      })
      ?.slice(0, 10)
      ?.map(t => ({
        user: t.key.user,
        relation: t.key.relation,
        object: t.key.object
      })) || [];

    return {
      resourceType: context.resourceType,
      resourceId: resourceId,
      relevantTuples: relevantTuples,
      tupleCount: context.currentTuples?.length || 0
    };
  }

  /**
   * Model分析用のコンテキストを生成
   * @param {Object} context - 完全なOpenFGAコンテキスト
   * @returns {Object} 最適化されたコンテキスト
   */
  static optimizeContextForModelAnalysis(context) {
    return {
      model: context.model,
      resourceType: context.resourceType,
      // Tupleの統計情報のみ（全Tupleは送信しない）
      tupleStats: {
        total: context.currentTuples?.length || 0,
        byRelation: this.groupTuplesByRelation(context.currentTuples)
      }
    };
  }

  /**
   * Tuple操作変換用のコンテキストを生成
   * @param {Object} context - 完全なOpenFGAコンテキスト
   * @param {Object} analysisResult - 意図分析の結果
   * @returns {Object} 最適化されたコンテキスト
   */
  static optimizeContextForTupleOperations(context, analysisResult) {
    const resourceId = context.resourceId || context.resourceData?.id;
    const targetUser = analysisResult?.target;
    const targetRelation = analysisResult?.permission;
    
    // resourceIdが存在しない場合の安全な処理
    if (!resourceId) {
      return {
        resourceType: context.resourceType,
        resourceId: null,
        currentTuples: context.currentTuples?.slice(0, 20).map(t => ({
          user: t.key.user,
          relation: t.key.relation,
          object: t.key.object
        })) || [],
        availableRelations: this.extractRelationsForType(context.model, context.resourceType),
        totalTupleCount: context.currentTuples?.length || 0
      };
    }
    
    // 型プレフィックスなしのIDで比較
    const plainResourceId = resourceId.includes(':') 
      ? resourceId.split(':')[1] 
      : resourceId;
    
    // 分析結果から関連するTupleのみを抽出
    // 対象リソースに関連する全てのTupleを含める（権限剥奪のため）
    const relevantTuples = context.currentTuples?.filter(t => {
      // objectフィールドから型プレフィックスなしのIDを抽出
      const tupleObjectId = t.key?.object?.includes(':')
        ? t.key.object.split(':')[1]
        : t.key?.object;
      
      const matchesUser = targetUser && t.key?.user?.includes(targetUser);
      const matchesObject = tupleObjectId === plainResourceId;
      const matchesRelation = targetRelation && t.key?.relation === targetRelation;
      
      return matchesUser || matchesObject || matchesRelation;
    })?.map(t => ({
      user: t.key.user,
      relation: t.key.relation,
      object: t.key.object
    })) || [];

    // 対象リソースタイプの利用可能なrelationのみを抽出
    const availableRelations = this.extractRelationsForType(
      context.model,
      context.resourceType
    );

    return {
      resourceType: context.resourceType,
      resourceId: resourceId,
      currentTuples: relevantTuples,  // プロンプト内で"currentTuples"として参照されるため名前を変更
      availableRelations: availableRelations,
      totalTupleCount: context.currentTuples?.length || 0
    };
  }

  /**
   * 統合実行計画用のコンテキストを生成
   * @param {Object} context - 完全なOpenFGAコンテキスト
   * @param {Object} modelAnalysis - Model分析結果
   * @param {Object} tupleOperations - Tuple操作結果
   * @returns {Object} 最適化されたコンテキスト
   */
  static optimizeContextForIntegratedPlan(context, modelAnalysis, tupleOperations) {
    const resourceId = context.resourceId || context.resourceData?.id;
    
    const optimized = {
      resourceType: context.resourceType,
      resourceId: resourceId,
      totalTupleCount: context.currentTuples?.length || 0,
      // 使用可能なrelationを含める（Tuple操作の検証用）
      availableRelations: this.extractRelationsForType(context.model, context.resourceType)
    };

    // Model変更がある場合のみModel情報を含める
    if (modelAnalysis?.needsModelChange || modelAnalysis?.proposedChanges?.length > 0) {
      optimized.modelChanges = modelAnalysis.proposedChanges;
      optimized.changeReason = modelAnalysis.reason;
    }

    // resourceIdが存在しない場合は全Tupleの一部を含める
    if (!resourceId) {
      const allTuples = context.currentTuples?.slice(0, 20).map(t => ({
        user: t.key.user,
        relation: t.key.relation,
        object: t.key.object
      })) || [];
      
      if (allTuples.length > 0) {
        optimized.currentTuples = allTuples;
      }
      return optimized;
    }

    // 対象リソースに関連する全てのTupleを含める
    // （DELETE操作のために既存Tupleの確認が必要）
    // 型プレフィックスなしのIDで比較（doorlockKidsRoom）
    const plainResourceId = resourceId.includes(':') 
      ? resourceId.split(':')[1] 
      : resourceId;
    
    const resourceTuples = context.currentTuples?.filter(t => {
      // objectフィールドから型プレフィックスなしのIDを抽出
      const tupleObjectId = t.key?.object?.includes(':')
        ? t.key.object.split(':')[1]
        : t.key?.object;
      return tupleObjectId === plainResourceId;
    })?.map(t => ({
      user: t.key.user,
      relation: t.key.relation,
      object: t.key.object
    })) || [];
    
    if (resourceTuples.length > 0) {
      optimized.currentTuples = resourceTuples;
    }

    return optimized;
  }

  /**
   * Tupleをrelationごとにグループ化して統計を生成
   * @param {Array} tuples - Relationship Tuples
   * @returns {Object} relation名をキー，出現回数を値とするオブジェクト
   */
  static groupTuplesByRelation(tuples) {
    if (!tuples || tuples.length === 0) return {};
    
    return tuples.reduce((acc, t) => {
      const rel = t.key?.relation || 'unknown';
      acc[rel] = (acc[rel] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Authorization Modelから特定タイプのrelation定義を抽出
   * @param {Object} model - Authorization Model
   * @param {string} resourceType - リソースタイプ
   * @returns {Object} relation定義のオブジェクト
   */
  static extractRelationsForType(model, resourceType) {
    if (!model || !model.type_definitions) return {};
    
    const typeSchema = model.type_definitions.find(t => t.type === resourceType);
    
    if (!typeSchema || !typeSchema.relations) return {};
    
    // relation名のみを抽出（定義の詳細は不要）
    return Object.keys(typeSchema.relations).reduce((acc, relName) => {
      acc[relName] = true;
      return acc;
    }, {});
  }

  /**
   * Tuple操作によって影響を受けるTupleを抽出
   * @param {Array} allTuples - 全てのRelationship Tuples
   * @param {Object} operations - Tuple操作結果
   * @returns {Array} 影響を受けるTuples
   */
  static extractAffectedTuples(allTuples, operations) {
    if (!allTuples || !operations?.operations) return [];
    
    const affectedKeys = new Set();
    
    // 操作対象のTupleキーを収集
    operations.operations.forEach(op => {
      if (op.tuple) {
        const key = `${op.tuple.user}#${op.tuple.relation}#${op.tuple.object}`;
        affectedKeys.add(key);
      }
    });
    
    // 該当するTupleのみを抽出
    return allTuples
      .filter(t => {
        const key = `${t.key.user}#${t.key.relation}#${t.key.object}`;
        return affectedKeys.has(key);
      })
      .map(t => ({
        user: t.key.user,
        relation: t.key.relation,
        object: t.key.object
      }));
  }
}
