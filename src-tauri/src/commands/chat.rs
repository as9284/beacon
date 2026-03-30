use crate::commands::keychain::read_api_key_from_keychain;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{command, ipc::Channel};

const GEMINI_MODELS_ENDPOINT: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_CONTEXT_WINDOW: u32 = 1_048_576;

// ── Model catalog ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeminiModel {
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub supports_vision: bool,
    pub context_window: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeminiModelCatalog {
    pub source: String,
    pub models: Vec<GeminiModel>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiModelsResponse {
    #[serde(default)]
    models: Vec<RemoteGeminiModel>,
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteGeminiModel {
    name: String,
    display_name: Option<String>,
    description: Option<String>,
    input_token_limit: Option<u32>,
    #[serde(default)]
    supported_generation_methods: Vec<String>,
}

#[command]
pub async fn list_gemini_models() -> GeminiModelCatalog {
    match read_api_key_from_keychain() {
        Ok(Some(api_key)) => match fetch_live_gemini_models(&api_key).await {
            Ok(models) if !models.is_empty() => GeminiModelCatalog {
                source: "live".to_string(),
                models,
            },
            _ => fallback_gemini_catalog(),
        },
        _ => fallback_gemini_catalog(),
    }
}

// ── Chat streaming ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "user" | "model"
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiPart {
    text: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(rename = "systemInstruction", skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiContent>,
    #[serde(rename = "generationConfig", skip_serializing_if = "Option::is_none")]
    generation_config: Option<GenerationConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GenerationConfig {
    temperature: f32,
    #[serde(rename = "maxOutputTokens")]
    max_output_tokens: u32,
}

/// Payload emitted through the IPC channel for each streaming chunk.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    #[serde(rename = "chunk")]
    Chunk { text: String },
    #[serde(rename = "done")]
    Done,
    #[serde(rename = "error")]
    Error { message: String },
}

fn fallback_gemini_catalog() -> GeminiModelCatalog {
    GeminiModelCatalog {
        source: "fallback".to_string(),
        models: fallback_gemini_models(),
    }
}

fn fallback_gemini_models() -> Vec<GeminiModel> {
    vec![
        GeminiModel {
            id: "gemini-3.1-pro-preview".to_string(),
            display_name: "Gemini 3.1 Pro Preview".to_string(),
            description: "Most capable Gemini 3.1 model for deep reasoning, long-context chat, and multimodal analysis.".to_string(),
            supports_vision: true,
            context_window: DEFAULT_CONTEXT_WINDOW,
        },
        GeminiModel {
            id: "gemini-3.1-flash-preview".to_string(),
            display_name: "Gemini 3.1 Flash Preview".to_string(),
            description: "Fast Gemini 3.1 model for everyday chat, codebase Q&A, and vision tasks.".to_string(),
            supports_vision: true,
            context_window: DEFAULT_CONTEXT_WINDOW,
        },
        GeminiModel {
            id: "gemini-3.1-flash-lite-preview".to_string(),
            display_name: "Gemini 3.1 Flash Lite Preview".to_string(),
            description: "Lightweight Gemini 3.1 model for low-latency chat and quick lookups.".to_string(),
            supports_vision: false,
            context_window: DEFAULT_CONTEXT_WINDOW,
        },
    ]
}

async fn fetch_live_gemini_models(api_key: &str) -> Result<Vec<GeminiModel>, String> {
    let client = Client::new();
    let mut next_page_token: Option<String> = None;
    let mut collected = Vec::new();

    loop {
        let request_url = next_page_token
            .as_deref()
            .map(|page_token| format!("{}?pageToken={}", GEMINI_MODELS_ENDPOINT, page_token))
            .unwrap_or_else(|| GEMINI_MODELS_ENDPOINT.to_string());

        let request = client
            .get(&request_url)
            .header("x-goog-api-key", api_key);

        let response = request.send().await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!(
                "Gemini model catalog request failed with status {}",
                response.status()
            ));
        }

        let payload: GeminiModelsResponse = response.json().await.map_err(|e| e.to_string())?;
        collected.extend(payload.models);

        match payload.next_page_token {
            Some(token) if !token.is_empty() => next_page_token = Some(token),
            _ => break,
        }
    }

    let mut models = collected
        .into_iter()
        .filter_map(remote_model_to_catalog_entry)
        .collect::<Vec<_>>();

    models.sort_by_key(|model| model_sort_rank(&model.id));
    models.dedup_by(|left, right| left.id == right.id);

    if models.is_empty() {
        return Err("Gemini returned no usable 3.1 chat models".to_string());
    }

    Ok(models)
}

fn remote_model_to_catalog_entry(model: RemoteGeminiModel) -> Option<GeminiModel> {
    let id = model
        .name
        .strip_prefix("models/")
        .unwrap_or(model.name.as_str())
        .to_string();

    if !is_supported_gemini_chat_model(&id, &model.supported_generation_methods) {
        return None;
    }

    let description = model
        .description
        .unwrap_or_else(|| fallback_description(&id));
    let supports_vision = infer_vision_support(&id, &description);

    Some(GeminiModel {
        display_name: model
            .display_name
            .unwrap_or_else(|| humanize_model_id(&id)),
        id,
        description,
        supports_vision,
        context_window: model.input_token_limit.unwrap_or(DEFAULT_CONTEXT_WINDOW),
    })
}

fn is_supported_gemini_chat_model(id: &str, supported_generation_methods: &[String]) -> bool {
    let normalized = id.to_ascii_lowercase();

    let can_generate = supported_generation_methods.is_empty()
        || supported_generation_methods.iter().any(|method| {
            matches!(method.as_str(), "generateContent" | "streamGenerateContent")
        });

    normalized.starts_with("gemini-3.1")
        && !normalized.contains("embedding")
        && !normalized.contains("aqa")
        && !normalized.contains("tts")
        && !normalized.contains("transcribe")
        && !normalized.contains("image-preview")
        && can_generate
}

fn infer_vision_support(id: &str, description: &str) -> bool {
    let normalized = format!("{} {}", id, description).to_ascii_lowercase();

    if normalized.contains("lite") {
        return false;
    }

    normalized.contains("vision")
        || normalized.contains("image")
        || normalized.contains("multimodal")
        || normalized.contains("video")
        || normalized.contains("audio")
        || normalized.contains("flash")
        || normalized.contains("pro")
}

fn fallback_description(id: &str) -> String {
    let normalized = id.to_ascii_lowercase();

    if normalized.contains("flash-lite") {
        "Lightweight Gemini 3.1 model for fast text chat and quick project lookups.".to_string()
    } else if normalized.contains("flash") {
        "Fast Gemini 3.1 model for chat, codebase Q&A, and multimodal analysis.".to_string()
    } else if normalized.contains("pro") {
        "Most capable Gemini 3.1 model for deep reasoning, long-context chat, and project analysis.".to_string()
    } else {
        "Gemini 3.1 model returned by the live API catalog.".to_string()
    }
}

fn humanize_model_id(id: &str) -> String {
    id.split('-')
        .map(|segment| match segment {
            "gemini" => "Gemini".to_string(),
            "pro" => "Pro".to_string(),
            "flash" => "Flash".to_string(),
            "lite" => "Lite".to_string(),
            "preview" => "Preview".to_string(),
            value => value.to_ascii_uppercase(),
        })
        .collect::<Vec<_>>()
        .join(" ")
        .replace("3.1", "3.1")
}

fn model_sort_rank(id: &str) -> u8 {
    let normalized = id.to_ascii_lowercase();

    if normalized.contains("pro") {
        0
    } else if normalized.contains("flash") && !normalized.contains("lite") {
        1
    } else if normalized.contains("lite") {
        2
    } else {
        3
    }
}

async fn resolve_model_id(requested_model_id: &str, api_key: &str) -> String {
    let models = fetch_live_gemini_models(api_key)
        .await
        .unwrap_or_else(|_| fallback_gemini_models());

    if models.iter().any(|model| model.id == requested_model_id) {
        requested_model_id.to_string()
    } else {
        models
            .first()
            .map(|model| model.id.clone())
            .unwrap_or_else(|| "gemini-3.1-pro-preview".to_string())
    }
}

/// Stream a Gemini chat response token-by-token via a Tauri IPC channel.
#[command]
pub async fn stream_chat(
    api_key: String,
    model_id: String,
    messages: Vec<ChatMessage>,
    system_prompt: String,
    channel: Channel<StreamEvent>,
) -> Result<(), String> {
    let resolved_model_id = resolve_model_id(&model_id, &api_key).await;

    let contents: Vec<GeminiContent> = messages
        .into_iter()
        .map(|m| GeminiContent {
            role: if m.role == "user" {
                "user".to_string()
            } else {
                "model".to_string()
            },
            parts: vec![GeminiPart { text: m.content }],
        })
        .collect();

    let system = if system_prompt.is_empty() {
        None
    } else {
        Some(GeminiContent {
            role: "user".to_string(),
            parts: vec![GeminiPart {
                text: system_prompt,
            }],
        })
    };

    let body = GeminiRequest {
        contents,
        system_instruction: system,
        generation_config: Some(GenerationConfig {
            temperature: 0.7,
            max_output_tokens: 8192,
        }),
    };

    let url = format!(
        "{}/{}:streamGenerateContent?alt=sse",
        GEMINI_MODELS_ENDPOINT, resolved_model_id
    );

    let client = Client::new();
    let response = client
        .post(&url)
        .header("x-goog-api-key", &api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let _ = channel.send(StreamEvent::Error {
            message: format!("Gemini API error {status}: {text}"),
        });
        return Ok(());
    }

    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let bytes = match chunk {
            Ok(b) => b,
            Err(e) => {
                let _ = channel.send(StreamEvent::Error {
                    message: e.to_string(),
                });
                return Ok(());
            }
        };

        let text = String::from_utf8_lossy(&bytes);
        for line in text.lines() {
            if let Some(json_str) = line.strip_prefix("data: ") {
                if json_str.trim() == "[DONE]" {
                    continue;
                }
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                    if let Some(chunk_text) = val
                        .pointer("/candidates/0/content/parts/0/text")
                        .and_then(|v| v.as_str())
                    {
                        let _ = channel.send(StreamEvent::Chunk {
                            text: chunk_text.to_string(),
                        });
                    }
                }
            }
        }
    }

    let _ = channel.send(StreamEvent::Done);
    Ok(())
}
