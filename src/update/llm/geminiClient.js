/**
 * Google Gemini API統合クライアント
 * OpenFGA権限変更のためのLLM分析機能
 */

import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
import { PromptBuilder } from './llmPrompts.js';

// 環境変数を読み込み
dotenv.config();

/**
 * Gemini APIクライアントクラス
 */
export class GeminiClient {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    
    this.model = 'gemini-2.5-flash';
    this.apiKey = process.env.GEMINI_API_KEY;
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    
    console.log(`🤖 LLMクライアント初期化完了 - 使用モデル: ${this.model}`);
  }

  /**
   * テキスト生成を実行
   * @param {string} prompt - 生成プロンプト
   * @param {string} stageName - 処理ステージ名（ログ用）
   * @returns {Promise<Object>} 生成されたテキストとメタデータ
   */
  async generateContent(prompt, stageName = 'Unknown') {
    try {
      const startTime = Date.now();
      
      // プロンプトのトークン数を概算（1トークン≈4文字として計算）
      const estimatedInputTokens = Math.ceil(prompt.length / 4);
      
      console.log(`🔄 [${stageName}] LLM生成開始 - 推定入力トークン: ${estimatedInputTokens}`);
      
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        generationConfig: {
          temperature: 0.3, // 創造性を抑制（一貫性重視）
          topP: 0.8,        // 上位80%の確率を持つ単語のみ使用
          topK: 20,         // 確率上位20個の単語のみから選択
          maxOutputTokens: 2048  // 2048トークン ≈ 1500-1800単語
        }
      });

      const text = response.text;
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // 出力トークン数を概算
      const estimatedOutputTokens = Math.ceil(text.length / 4);
      const totalEstimatedTokens = estimatedInputTokens + estimatedOutputTokens;
      
      // 使用量のログ
      console.log(`✅ [${stageName}] LLM生成完了`);
      console.log(`   ⏱️  処理時間: ${duration}ms`);
      console.log(`   📊 推定入力トークン: ${estimatedInputTokens}`);
      console.log(`   📊 推定出力トークン: ${estimatedOutputTokens}`);
      console.log(`   📊 推定合計トークン: ${totalEstimatedTokens}`);
      
      if (!text) {
        throw new Error('Gemini APIからテキストが得られませんでした');
      }
      
      return {
        text,
        metadata: {
          duration,
          estimatedInputTokens,
          estimatedOutputTokens,
          totalEstimatedTokens,
          stageName
        }
      };
    } catch (error) {
      console.error('❌ Gemini API エラー:', error);
      if (error.message.includes('429') || error.message.includes('quota')) {
        throw new Error('Gemini APIの利用制限に達しました．しばらく待ってから再試行してください．');
      }
      throw new Error(`Gemini API エラー: ${error.message}`);
    }
  }

  /**
   * JSON形式の応答をパースして返却
   * @param {string} responseText - LLMの応答テキスト
   * @returns {Object} パースされたJSONオブジェクト
   */
  parseJsonResponse(responseText) {
    try {
      // 複数のJSON抽出パターンを試行
      let jsonText = null;
      
      // パターン1: ```json と ``` で囲まれたJSON
      const codeBlockMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      }
      
      // パターン2: 最初の { から最後の } まで（バランスを考慮）
      if (!jsonText) {
        const firstBrace = responseText.indexOf('{');
        if (firstBrace !== -1) {
          let depth = 0;
          let inString = false;
          let escapeNext = false;
          
          for (let i = firstBrace; i < responseText.length; i++) {
            const char = responseText[i];
            
            if (escapeNext) {
              escapeNext = false;
              continue;
            }
            
            if (char === '\\') {
              escapeNext = true;
              continue;
            }
            
            if (char === '"' && !escapeNext) {
              inString = !inString;
              continue;
            }
            
            if (!inString) {
              if (char === '{') depth++;
              if (char === '}') {
                depth--;
                if (depth === 0) {
                  jsonText = responseText.substring(firstBrace, i + 1);
                  break;
                }
              }
            }
          }
        }
      }
      
      // パターン3: 単純な正規表現マッチ（フォールバック）
      if (!jsonText) {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }
      }
      
      if (!jsonText) {
        throw new Error('応答からJSONが見つかりません');
      }
      
      // JSONをパース
      const parsed = JSON.parse(jsonText);
      return parsed;
      
    } catch (error) {
      console.error('❌ JSON解析エラー:', error);
      console.error('応答テキスト（最初の500文字）:', responseText.substring(0, 500));
      
      // デバッグ用：抽出されたJSON文字列を表示
      if (error.message.includes('position')) {
        const position = parseInt(error.message.match(/\d+/)?.[0] || '0');
        console.error('エラー位置周辺:', responseText.substring(Math.max(0, position - 50), position + 50));
      }
      
      throw new Error(`LLM応答のJSON解析に失敗しました: ${error.message}`);
    }
  }

  /**
   * 自然言語の内容を分析して意図を理解する
   * @param {string} naturalLanguageInput - ユーザの自然言語入力
   * @param {string} resourceType - リソースタイプ (user, device, group)
   * @param {Object} resourceData - 選択されたリソースのデータ
   * @param {Object} context - OpenFGAコンテキスト情報
   * @returns {Promise<Object>} 分析結果
   */
  async analyzeUserIntent(naturalLanguageInput, resourceType, resourceData, context) {
    try {
      console.log('🔍 自然言語の意図を分析中...');
      
      // 軽量コンテキストを使用（トークン数削減）
      const optimizedContext = PromptBuilder.optimizeContextForIntentAnalysis(context);
      
      // プロンプトを構築
      const prompt = PromptBuilder.buildComprehensiveAnalysisPrompt(
        naturalLanguageInput,
        resourceType,
        resourceData,
        optimizedContext
      );
      
      // Gemini APIを呼び出し
      const response = await this.generateContent(prompt, '意図分析');
      const analysisText = response.text;
      
      console.log('✅ LLM分析完了');
      
      // JSONレスポンスをパース
      try {
        const analysisResult = this.parseJsonResponse(analysisText);
        return {
          success: true,
          analysis: analysisResult,
          rawResponse: analysisText,
          metadata: response.metadata
        };
      } catch (parseError) {
        console.warn('⚠️ JSON解析に失敗，テキスト分析結果を返します');
        return {
          success: false,
          error: 'JSON_PARSE_ERROR',
          rawResponse: analysisText,
          analysis: this.parseTextualResponse(analysisText),
          metadata: response.metadata
        };
      }
      
    } catch (error) {
      console.error('❌ LLM分析エラー:', error.message);
      return {
        success: false,
        error: error.message,
        analysis: null
      };
    }
  }

  /**
   * Authorization Model変更の必要性を分析
   * @param {string} naturalLanguageInput - ユーザの自然言語入力
   * @param {string} resourceType - リソースタイプ (user, device, group)
   * @param {Object} resourceData - 選択されたリソースのデータ
   * @param {Object} authorizationModel - Authorization Model
   * @returns {Promise<Object>} モデル分析結果
   */
  async analyzeAuthorizationModel(naturalLanguageInput, resourceType, resourceData, authorizationModel) {
    try {
      console.log('🔍 Authorization Model変更の必要性を分析中...');
      
      // Model分析用の最適化されたコンテキストを生成
      const fullContext = {
        model: authorizationModel,
        resourceType: resourceType,
        currentTuples: authorizationModel.currentTuples || []
      };
      const optimizedContext = PromptBuilder.optimizeContextForModelAnalysis(fullContext);
      
      // 要求される操作を構造化
      const requestedOperation = PromptBuilder.structureRequestedOperation(
        naturalLanguageInput, 
        resourceType, 
        resourceData
      );
      
      // プロンプトを構築
      const prompt = PromptBuilder.buildAuthorizationModelAnalysisPrompt(
        naturalLanguageInput,
        resourceType,
        resourceData.id,
        requestedOperation,
        optimizedContext.model  // 最適化済みコンテキストのmodelを使用
      );
      
      // Gemini APIを呼び出し
      const response = await this.generateContent(prompt, 'Model分析');
      const analysisText = response.text;
      
      console.log('✅ Authorization Model分析完了');
      
      // JSONレスポンスをパース
      try {
        const modelAnalysis = this.parseJsonResponse(analysisText);
        return {
          success: true,
          modelAnalysis: modelAnalysis,
          rawResponse: analysisText,
          metadata: response.metadata
        };
      } catch (parseError) {
        console.warn('⚠️ JSON解析に失敗');
        return {
          success: false,
          error: 'JSON_PARSE_ERROR',
          rawResponse: analysisText,
          metadata: response.metadata
        };
      }
      
    } catch (error) {
      console.error('❌ Authorization Model分析エラー:', error.message);
      return {
        success: false,
        error: error.message,
        modelAnalysis: null
      };
    }
  }

  /**
   * 統合された実行計画を生成（Authorization Model + Tuple操作）
   * @param {Object} modelAnalysis - モデル分析結果
   * @param {Object} tupleOperations - Tuple操作結果
   * @param {Object} context - OpenFGAコンテキスト情報
   * @returns {Promise<Object>} 統合実行計画
   */
  async generateIntegratedExecutionPlan(modelAnalysis, tupleOperations, context) {
    try {
      console.log('🔄 統合実行計画を生成中...');
      
      // 統合実行計画用の最適化されたコンテキストを生成
      const optimizedContext = PromptBuilder.optimizeContextForIntegratedPlan(
        context,
        modelAnalysis,
        tupleOperations
      );
      
      // プロンプトを構築
      const prompt = PromptBuilder.buildIntegratedOperationsPrompt(
        modelAnalysis,
        tupleOperations,
        optimizedContext
      );
      
      // Gemini APIを呼び出し
      const response = await this.generateContent(prompt, '統合実行計画');
      const planText = response.text;
      
      console.log('✅ 統合実行計画生成完了');
      
      // JSONレスポンスをパース
      try {
        const executionPlan = this.parseJsonResponse(planText);
        return {
          success: true,
          executionPlan: executionPlan,
          rawResponse: planText,
          metadata: response.metadata
        };
      } catch (parseError) {
        console.warn('⚠️ JSON解析に失敗');
        return {
          success: false,
          error: 'JSON_PARSE_ERROR',
          rawResponse: planText,
          metadata: response.metadata
        };
      }
      
    } catch (error) {
      console.error('❌ 統合実行計画生成エラー:', error.message);
      return {
        success: false,
        error: error.message,
        executionPlan: null
      };
    }
  }

  /**
   * 分析結果をOpenFGA操作に変換
   * @param {Object} analysisResult - LLM分析結果
   * @param {Object} context - OpenFGAコンテキスト情報
   * @returns {Promise<Object>} OpenFGA操作指示
   */
  async convertToOpenFGAOperations(analysisResult, context) {
    try {
      console.log('🔄 OpenFGA操作に変換中...');
      
      // Tuple操作変換用の最適化されたコンテキストを生成
      const optimizedContext = PromptBuilder.optimizeContextForTupleOperations(
        context,
        analysisResult
      );
      
      // プロンプトを構築
      const prompt = PromptBuilder.buildNaturalLanguageToJsonPrompt(
        analysisResult,
        optimizedContext
      );
      
      // Gemini APIを呼び出し
      const response = await this.generateContent(prompt, 'Tuple操作変換');
      const operationsText = response.text;
      
      console.log('✅ OpenFGA操作変換完了');
      
      // JSONレスポンスをパース
      try {
        const operations = this.parseJsonResponse(operationsText);
        return {
          success: true,
          operations: operations,
          rawResponse: operationsText,
          metadata: response.metadata
        };
      } catch (parseError) {
        console.warn('⚠️ JSON解析に失敗');
        return {
          success: false,
          error: 'JSON_PARSE_ERROR',
          rawResponse: operationsText,
          metadata: response.metadata
        };
      }
      
    } catch (error) {
      console.error('❌ OpenFGA操作変換エラー:', error.message);
      return {
        success: false,
        error: error.message,
        operations: null
      };
    }
  }

  /**
   * 権限操作の妥当性を検証
   * @param {Object} operations - OpenFGA操作
   * @param {Object} context - OpenFGAコンテキスト情報
   * @returns {Promise<Object>} 検証結果
   */
  async validatePermissions(operations, context) {
    try {
      console.log('🔍 権限操作の妥当性を検証中...');
      
      // プロンプトを構築
      const prompt = PromptBuilder.buildValidatePermissionsPrompt(
        operations,
        context
      );
      
      // Gemini APIを呼び出し
      const response = await this.generateContent(prompt, '権限検証');
      const validationText = response.text;
      
      console.log('✅ 権限検証完了');
      
      // JSONレスポンスをパース
      try {
        const validation = this.parseJsonResponse(validationText);
        return {
          success: true,
          validation: validation,
          rawResponse: validationText,
          metadata: response.metadata
        };
      } catch (parseError) {
        console.warn('⚠️ JSON解析に失敗');
        return {
          success: false,
          error: 'JSON_PARSE_ERROR',
          rawResponse: validationText,
          metadata: response.metadata
        };
      }
      
    } catch (error) {
      console.error('❌ 権限検証エラー:', error.message);
      return {
        success: false,
        error: error.message,
        validation: null
      };
    }
  }

  /**
   * テキスト形式のレスポンスを簡易解析
   * @param {string} textResponse - テキストレスポンス
   * @returns {Object} 解析結果
   */
  parseTextualResponse(textResponse) {
    return {
      intent: 'UNKNOWN',
      confidence: 0.5,
      action: 'MANUAL_REVIEW_REQUIRED',
      target: null,
      permission: null,
      reasoning: textResponse,
      suggestions: ['手動でOpenFGA操作を確認してください']
    };
  }

  /**
   * 完全統合分析 - Authorization ModelとTuple操作の両方を分析
   * @param {string} naturalLanguageInput - ユーザの自然言語入力
   * @param {string} resourceType - リソースタイプ (user, device, group)
   * @param {Object} resourceData - 選択されたリソースのデータ
   * @param {Object} context - OpenFGAコンテキスト情報
   * @returns {Promise<Object>} 完全な実行計画
   */
  async analyzeCompleteOpenFGAOperation(naturalLanguageInput, resourceType, resourceData, context) {
    try {
      console.log('🚀 完全統合分析を開始...');
      const overallStartTime = Date.now();
      const stageMetadata = [];
      
      // 1. 意図分析
      const intentResult = await this.analyzeUserIntent(
        naturalLanguageInput, 
        resourceType, 
        resourceData, 
        context
      );
      
      if (intentResult.metadata) {
        stageMetadata.push(intentResult.metadata);
      }
      
      if (!intentResult.success) {
        return { success: false, error: 'INTENT_ANALYSIS_FAILED', details: intentResult };
      }
      
      // 2. Authorization Model分析
      const modelResult = await this.analyzeAuthorizationModel(
        naturalLanguageInput,
        resourceType,
        resourceData,
        context.model
      );
      
      if (modelResult.metadata) {
        stageMetadata.push(modelResult.metadata);
      }
      
      if (!modelResult.success) {
        return { success: false, error: 'MODEL_ANALYSIS_FAILED', details: modelResult };
      }
      
      // 3. Tuple操作生成
      const tupleResult = await this.convertToOpenFGAOperations(
        intentResult.analysis,
        context
      );
      
      if (tupleResult.metadata) {
        stageMetadata.push(tupleResult.metadata);
      }
      
      if (!tupleResult.success) {
        return { success: false, error: 'TUPLE_OPERATION_FAILED', details: tupleResult };
      }
      
      // 4. 統合実行計画生成
      const planResult = await this.generateIntegratedExecutionPlan(
        modelResult.modelAnalysis,
        tupleResult.operations,
        context
      );
      
      if (planResult.metadata) {
        stageMetadata.push(planResult.metadata);
      }
      
      if (!planResult.success) {
        return { success: false, error: 'INTEGRATION_FAILED', details: planResult };
      }
      
      // 集計情報を計算
      const overallDuration = Date.now() - overallStartTime;
      const totalInputTokens = stageMetadata.reduce((sum, m) => sum + (m.estimatedInputTokens || 0), 0);
      const totalOutputTokens = stageMetadata.reduce((sum, m) => sum + (m.estimatedOutputTokens || 0), 0);
      const totalTokens = stageMetadata.reduce((sum, m) => sum + (m.totalEstimatedTokens || 0), 0);
      const stageDurations = stageMetadata.reduce((sum, m) => sum + (m.duration || 0), 0);
      
      // パフォーマンスサマリーを表示
      console.log('\n📊 ========== LLM処理サマリー ==========');
      console.log(`⏱️  総処理時間: ${overallDuration}ms`);
      console.log(`⏱️  LLM生成時間合計: ${stageDurations}ms`);
      console.log(`⏱️  オーバーヘッド: ${overallDuration - stageDurations}ms`);
      console.log(`🔢 総推定入力トークン: ${totalInputTokens}`);
      console.log(`🔢 総推定出力トークン: ${totalOutputTokens}`);
      console.log(`🔢 総推定トークン: ${totalTokens}`);
      console.log('\n📝 ステージ別内訳:');
      stageMetadata.forEach(m => {
        console.log(`  - [${m.stageName}]`);
        console.log(`    ⏱️  処理時間: ${m.duration}ms`);
        console.log(`    📥 入力トークン: ${m.estimatedInputTokens}`);
        console.log(`    📤 出力トークン: ${m.estimatedOutputTokens}`);
        console.log(`    🔢 合計トークン: ${m.totalEstimatedTokens}`);
      });
      console.log('==========================================\n');
      
      console.log('✅ 完全統合分析完了');
      
      return {
        success: true,
        analysis: {
          intent: intentResult.analysis,
          modelAnalysis: modelResult.modelAnalysis,
          tupleOperations: tupleResult.operations,
          executionPlan: planResult.executionPlan
        },
        rawResponses: {
          intent: intentResult.rawResponse,
          model: modelResult.rawResponse,
          tuple: tupleResult.rawResponse,
          plan: planResult.rawResponse
        },
        performance: {
          overallDuration,
          stageDurations,
          overhead: overallDuration - stageDurations,
          totalInputTokens,
          totalOutputTokens,
          totalTokens,
          stages: stageMetadata
        }
      };
      
    } catch (error) {
      console.error('❌ 完全統合分析エラー:', error.message);
      return {
        success: false,
        error: error.message,
        analysis: null
      };
    }
  }

  /**
   * APIキーの有効性をテスト
   * @returns {Promise<boolean>} APIキーが有効かどうか
   */
  async testConnection() {
    try {
      console.log('🔗 Gemini API接続をテスト中...');
      
      const response = await this.generateContent("テスト: このメッセージに「OK」と返答してください．", '接続テスト');
      
      console.log('✅ Gemini API接続成功');
      return true;
    } catch (error) {
      console.error('❌ Gemini API接続失敗:', error.message);
      return false;
    }
  }
}

/**
 * デフォルトのGeminiクライアントインスタンスを作成
 * @returns {GeminiClient} Geminiクライアントインスタンス
 */
export function createGeminiClient() {
  return new GeminiClient();
}
