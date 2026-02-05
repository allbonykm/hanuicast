import { GoogleGenAI, Modality, Type } from "@google/genai";
import { Paper } from "../types";
import { base64ToFloat32Array, pcmToWav } from "../utils/audioUtils";

// Initialize Gemini Client
// Note: In a production Next.js app, this would be server-side. 
// For this SPA demo, we use it client-side with the assumption the API KEY is safe or proxied.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// System instruction for the content generator
const CONTENT_SYSTEM_INSTRUCTION = `
You are a helpful medical research assistant specialized in Traditional Korean Medicine (Hanui). 
Generate realistic, high-quality summaries of hypothetical or recent research papers suitable for a podcast format.
Focus on topics like Acupuncture, Herbal Medicine, Chuna Manual Therapy, and Integrative Medicine.
**CRITICAL**: Randomly assign one of the following sources as the 'journal': "KCI", "OASIS", "PubMed", "JAMA", "Nature". Mix them up well.
Ensure the tone is professional, academic, yet accessible for audio listening.
`;

export const fetchPapers = async (topic?: string): Promise<Paper[]> => {
  try {
    const prompt = topic 
      ? `Generate 5 distinct, realistic research paper summaries focused specifically on the topic: "${topic}". Ensure the content is highly relevant to this keyword.`
      : "Generate 5 distinct, realistic research paper summaries for today's daily briefing.";

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: CONTENT_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              summary: { type: Type.STRING, description: "A 2-3 sentence summary optimized for reading aloud." },
              keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              authors: { type: Type.STRING },
              journal: { type: Type.STRING },
              date: { type: Type.STRING },
            },
            required: ["id", "title", "summary", "keywords", "authors", "journal", "date"]
          }
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      // Add mock URLs since the AI generates fictional/hallucinated papers for the demo
      return data.map((p: any) => ({
        ...p,
        originalUrl: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(p.title)}` 
      }));
    }
    return [];
  } catch (error) {
    console.error("Failed to fetch papers:", error);
    // Return fallback data if API fails
    return [
      {
        id: "1",
        title: "만성 요통 환자에서 침 치료와 약침 치료의 비교 효과 연구",
        summary: "본 무작위 대조 시험은 만성 요통 환자를 대상으로 침 치료 단독군과 약침 병행군의 통증 감소 효과를 비교하였습니다. 8주간의 추적 관찰 결과, 약침 병행군에서 유의미한 기능 장애 지수 개선이 확인되었습니다.",
        keywords: ["요통", "약침", "침치료", "RCT"],
        authors: "김철수, 이영희 외",
        journal: "KCI",
        date: "2024-05-12",
        originalUrl: "#"
      },
      {
        id: "2",
        title: "감초 추출물의 신경 보호 효과에 대한 분자적 기전",
        summary: "이 연구는 감초의 주요 성분인 글리시리진이 신경 세포의 산화적 스트레스를 억제하는 기전을 규명했습니다. 특히 Nrf2 경로 활성화를 통해 세포 사멸을 방지할 수 있음을 시사합니다.",
        keywords: ["감초", "신경보호", "산화스트레스", "본초학"],
        authors: "박민수 연구팀",
        journal: "OASIS",
        date: "2024-05-10",
        originalUrl: "#"
      }
    ];
  }
};

export const generatePaperAudio = async (text: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // Using a Korean-sounding voice if available, or default
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio data returned");
    }

    const float32Data = base64ToFloat32Array(base64Audio);
    const wavBlob = pcmToWav(float32Data);
    return URL.createObjectURL(wavBlob);

  } catch (error) {
    console.error("Failed to generate audio:", error);
    return null;
  }
};