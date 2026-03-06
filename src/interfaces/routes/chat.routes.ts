import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import { sendSuccess } from "../utils/response.js";
import { createModuleLogger } from "../../shared/logger.js";
import type { AIPort } from "../../application/ports/ai.port.js";

const log = createModuleLogger("chat-routes");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

interface ChatSession {
  id: string;
  userId: string;
  messages: Array<{ role: string; content: string; timestamp: Date }>;
  files: string[];
  fileBuffer?: Buffer;
  analysis?: any;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

interface ChatRoutesConfig {
  aiService: AIPort;
  authenticate: RequestHandler;
  chatRepository?: any; // Optional for now
  storageService?: any; // Optional for now
  queueService?: any; // Optional for now
}

export const createChatRoutes = ({
  aiService,
  authenticate,
}: ChatRoutesConfig): Router => {
  const router = Router();

  // Store chat sessions in memory (use Redis in production)
  const sessions = new Map<string, ChatSession>();

  // Cleanup old sessions (older than 24 hours)
  setInterval(
    () => {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      for (const [sessionId, session] of sessions.entries()) {
        if (session.updatedAt.getTime() < oneDayAgo) {
          sessions.delete(sessionId);
          log.info({ sessionId }, "Cleaned up old session");
        }
      }
    },
    60 * 60 * 1000
  ); // Run every hour

  // Create chat session
  router.post(
    "/sessions",
    authenticate,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const session: ChatSession = {
          id: sessionId,
          userId: req.user!.id,
          messages: [],
          files: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        sessions.set(sessionId, session);
        log.info(
          { sessionId, userId: req.user!.id },
          "Created new chat session"
        );

        sendSuccess(res, { id: sessionId }, 201);
      } catch (error) {
        next(error);
      }
    }
  );

  // Upload course folder (ZIP)
  router.post(
    "/sessions/:sessionId/upload",
    authenticate,
    upload.single("file"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId = req.params["sessionId"] as string;
        const session = sessions.get(sessionId);

        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        if (session.userId !== req.user!.id) {
          return res.status(403).json({ error: "Unauthorized" });
        }

        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        log.info(
          {
            sessionId,
            fileName: req.file.originalname,
            fileSize: req.file.size,
          },
          "Processing uploaded file"
        );

        // Store file buffer for later use
        session.fileBuffer = req.file.buffer;

        // Extract ZIP and get file list
        const zip = new AdmZip(req.file.buffer);
        const zipEntries = zip.getEntries();
        const fileList = zipEntries
          .filter((entry) => !entry.isDirectory)
          .map((entry) => entry.entryName);

        session.files = fileList;
        session.updatedAt = new Date();

        log.info(
          { sessionId, fileCount: fileList.length },
          "Extracted file list from ZIP"
        );

        // Analyze structure with OpenAI
        log.info({ sessionId }, "Starting OpenAI analysis");

        const analysisPrompt = `Analyze this course folder structure and organize it into logical sections.

Files in the course folder:
${fileList.slice(0, 100).join("\n")}
${fileList.length > 100 ? `\n... and ${fileList.length - 100} more files` : ""}

Instructions:
1. Group related files into logical course sections (e.g., "Introduction", "Week 1", "Module 2", etc.)
2. Determine the order of sections based on file names and structure
3. Suggest a course name, description, category, and price based on the content
4. Be intelligent about identifying videos, notes, assignments, and exams

Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{
  "sections": [
    {
      "title": "Section name",
      "order": 1,
      "files": ["file1.pdf", "file2.mp4"],
      "description": "Brief description of what this section covers"
    }
  ],
  "metadata": {
    "suggestedName": "Course Name",
    "suggestedDescription": "Detailed course description (2-3 sentences)",
    "suggestedCategory": "Programming|Design|Business|Marketing|Photography|Music|Health & Fitness|Language|Other",
    "suggestedPrice": 49.99
  }
}`;

        const analysisResponse = await aiService.chatCompletion({
          messages: [
            {
              role: "system",
              content:
                "You are a course structure analyzer. Analyze file lists and organize them into logical course sections. Always return valid JSON only, no markdown formatting.",
            },
            {
              role: "user",
              content: analysisPrompt,
            },
          ],
          temperature: 0.7,
          maxTokens: 2000,
        });

        // Clean response - remove markdown code blocks if present
        let cleanedResponse = analysisResponse.content.trim();
        if (cleanedResponse.startsWith("```json")) {
          cleanedResponse = cleanedResponse
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "");
        } else if (cleanedResponse.startsWith("```")) {
          cleanedResponse = cleanedResponse.replace(/```\n?/g, "");
        }

        const analysis = JSON.parse(cleanedResponse);
        session.analysis = analysis;

        log.info(
          {
            sessionId,
            sectionCount: analysis.sections.length,
            suggestedName: analysis.metadata.suggestedName,
          },
          "Course structure analyzed"
        );

        return sendSuccess(res, {
          fileCount: fileList.length,
          analysis,
        });
      } catch (error) {
        log.error(
          { err: error, sessionId: req.params["sessionId"] },
          "Upload error"
        );
        return next(error);
      }
    }
  );

  // Send chat message
  router.post(
    "/sessions/:sessionId/messages",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId = req.params["sessionId"] as string;
        const session = sessions.get(sessionId);

        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        if (session.userId !== req.user!.id) {
          return res.status(403).json({ error: "Unauthorized" });
        }

        const userMessage = req.body.content;

        if (!userMessage || typeof userMessage !== "string") {
          return res.status(400).json({ error: "Message content is required" });
        }

        session.messages.push({
          role: "user",
          content: userMessage,
          timestamp: new Date(),
        });

        log.info(
          { sessionId, messageLength: userMessage.length },
          "Processing chat message"
        );

        // Get AI response with context
        const contextPrompt = `You are a friendly and helpful course upload assistant for an online learning platform.

Your role:
- Guide instructors through uploading their course materials
- Ask clarifying questions about their course
- Provide encouragement and support
- Be conversational and natural

Current context:
- Has uploaded files: ${session.files.length > 0}
- File count: ${session.files.length}
- Course name: ${session.metadata?.name || "Not set"}
- Current step: ${session.analysis ? "metadata" : "upload"}

Keep responses concise (2-3 sentences max) and friendly.

User message: ${userMessage}`;

        const aiResponseResult = await aiService.chatCompletion({
          messages: [
            {
              role: "system",
              content: contextPrompt,
            },
            ...session.messages.slice(-5).map((msg) => ({
              // Include last 5 messages for context
              role: msg.role as "user" | "assistant",
              content: msg.content,
            })),
            {
              role: "user",
              content: userMessage,
            },
          ],
          temperature: 0.7,
          maxTokens: 500,
        });

        const aiResponse = aiResponseResult.content;

        session.messages.push({
          role: "assistant",
          content: aiResponse,
          timestamp: new Date(),
        });

        session.updatedAt = new Date();

        log.info(
          { sessionId, responseLength: aiResponse.length },
          "Generated AI response"
        );

        return sendSuccess(res, { content: aiResponse });
      } catch (error) {
        log.error(
          { err: error, sessionId: req.params["sessionId"] },
          "Chat message error"
        );
        return next(error);
      }
    }
  );

  // Get session details
  router.get(
    "/sessions/:sessionId",
    authenticate,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId = req.params["sessionId"] as string;
        const session = sessions.get(sessionId);

        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        if (session.userId !== req.user!.id) {
          return res.status(403).json({ error: "Unauthorized" });
        }

        // Return session without file buffer
        const { fileBuffer, ...sessionData } = session;

        return sendSuccess(res, sessionData);
      } catch (error) {
        return next(error);
      }
    }
  );

  return router;
};
