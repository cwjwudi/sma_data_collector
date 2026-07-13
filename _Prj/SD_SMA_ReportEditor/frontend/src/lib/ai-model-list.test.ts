import { describe, expect, it } from "vitest";
import { isModelInUpstreamList, pickPreferredChatModel } from "./ai-model-list";

describe("ai-model-list", () => {
  it("匹配当前模型是否在上游列表", () => {
    expect(isModelInUpstreamList("gpt-4.1", ["deepseek-ai/DeepSeek-V3"])).toBe(false);
    expect(isModelInUpstreamList("deepseek-ai/DeepSeek-V3", ["deepseek-ai/DeepSeek-V3"])).toBe(true);
  });

  it("优先跳过 embedding 选聊天模型", () => {
    expect(
      pickPreferredChatModel(["BAAI/bge-m3", "deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1"]),
    ).toBe("deepseek-ai/DeepSeek-V3");
  });
});
