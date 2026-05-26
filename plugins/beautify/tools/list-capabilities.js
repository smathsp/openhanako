export const name = "list-capabilities";
export const description = "列出 Beautify 工具目前支持的审美增强能力。";

export { isBeautifyEnabledForAgentConfig as isEnabledForAgentConfig } from "../lib/availability.js";

export const parameters = {
  type: "object",
  properties: {},
};

export async function execute() {
  return {
    content: [{
      type: "text",
      text: "Beautify 当前支持 Markdown cover 写回：Agent 先准备一张图片，可以来自生图工具、未来的内置头图库或用户本地图片，再用 Beautify 把图片复制到附件文件夹并写入 cover frontmatter。",
    }],
    details: {
      capabilities: [{
        id: "markdown-cover",
        target: "markdown",
        tools: ["beautify_create-cover", "beautify_apply-cover-candidate"],
        imageRatio: "3:2",
        responsibility: "apply-existing-image",
      }],
    },
  };
}
