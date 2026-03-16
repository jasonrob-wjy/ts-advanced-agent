import { StateSchema, MessagesValue } from "@langchain/langgraph";
import { z } from "zod";

export const AgentState = new StateSchema({
  messages: MessagesValue,
  context: z.string().optional(),
  critique: z.string().optional(),
  score: z.number().optional(),
  attempts: z.number().optional(),
});
