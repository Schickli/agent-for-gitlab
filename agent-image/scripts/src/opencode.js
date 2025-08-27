import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";
import logger from "./logger.js";

export async function runOpencode(context, prompt) {
  logger.start("Running opencode via SDK...");
  
  const server = await createOpencodeServer({
    hostname: "0.0.0.0",
    port: 3001,
  });
  
  logger.info(`Server running at ${server.url}`);

  try {
    const client = createOpencodeClient({
      baseUrl: "http://0.0.0.0:3001",
    });

    await client.app.init();

    const session = await client.session.create({ title: "GitLab Runner Session" });

    if (session.error) {
      logger.error("Session creation error: ", session.error);
      throw new Error(`Session creation error: ${session.error.message}`);
    }

    logger.info("Session created: ", session.data.id);

    const [providerID, modelID] = context.opencodeModel.split('/');
    if (!providerID || !modelID) {
      throw new Error(`Invalid OPENCODE_MODEL format: ${context.opencodeModel}. Expected format: provider/model`);
    }

    logger.info(`Using model: ${modelID} from provider: ${providerID}`);

    const message = await client.session.chat({
      path: {
        id: session.data.id,
      },
      body: {
        modelID,
        providerID,
        system: context.agentPrompt || undefined,
        parts: [{ type: "text", text: prompt }],
      },
    });

    if (message.error) {
      logger.error("AI response error: ", message.error);
      throw new Error(`AI response error: ${message.error.message}`);
    }

    const aiOutput = message.data.parts
      .filter(part => part.type === "text")
      .map(part => part.text)
      .join("\n");

    logger.info(aiOutput);
    logger.success("opencode SDK completed");
    
    return aiOutput;
  } finally {
    server.close();
  }
}