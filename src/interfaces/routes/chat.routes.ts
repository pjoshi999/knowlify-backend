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
  thumbnailUrl?: string;
  analysis?: any;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

interface ChatRoutesConfig {
  aiService: AIPort;
  authenticate: RequestHandler;
  chatRepository?: any; // Optional for now
  storageService?: any;
  courseRepository?: any; // For asset upload
  queueService?: any; // Optional for now
}

export const createChatRoutes = ({
  aiService,
  authenticate,
  storageService,
  courseRepository,
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

        // Filter out junk files and only include valid course assets
        const validExtensions = [
          "mp4",
          "avi",
          "mov",
          "wmv",
          "webm",
          "pdf",
          "doc",
          "docx",
          "txt",
          "md",
        ];
        const junkFiles = [
          ".ds_store",
          "thumbs.db",
          "__macosx",
          ".git",
          ".gitignore",
          "desktop.ini",
        ];

        const fileList = zipEntries
          .filter((entry) => {
            if (entry.isDirectory) return false;

            const fileName = entry.entryName.toLowerCase();

            // Skip junk files
            const isJunk = junkFiles.some((junk) => fileName.includes(junk));
            if (isJunk) return false;

            // Skip thumbnail files
            if (fileName.includes("thumbnail") || fileName.includes("thumb"))
              return false;

            // Only include files with valid extensions
            const fileExt = fileName.split(".").pop() || "";
            return validExtensions.includes(fileExt);
          })
          .map((entry) => entry.entryName);

        session.files = fileList;
        session.updatedAt = new Date();

        log.info(
          {
            sessionId,
            fileCount: fileList.length,
            totalEntries: zipEntries.length,
          },
          "Extracted and filtered file list from ZIP"
        );

        // Analyze structure with OpenAI
        log.info({ sessionId }, "Starting OpenAI analysis");

        const analysisPrompt = `Analyze this course folder structure and organize it into logical sections.

Files in the course folder:
${fileList.slice(0, 100).join("\n")}
${fileList.length > 100 ? `\n... and ${fileList.length - 100} more files` : ""}

Instructions:
1. Group files by their folder names - each folder should become a section
2. Use the folder name as the section title (e.g., "01 Introduction" folder → "Introduction" section)
3. Preserve the numeric ordering from folder names (01, 02, 03, etc.)
4. For the course name, use the first folder name or derive from the overall structure
5. Identify file types: videos (.mp4, .mov, .avi), documents (.pdf, .doc), notes (.txt, .md)

Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{
  "sections": [
    {
      "title": "Section name from folder",
      "order": 1,
      "files": ["video.mp4", "notes.pdf"],
      "description": "Brief description of what this section covers"
    }
  ],
  "metadata": {
    "suggestedName": "Course Name (derived from first folder or overall structure)",
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

  // Upload thumbnail for course
  router.post(
    "/sessions/:sessionId/thumbnail",
    authenticate,
    upload.single("thumbnail"), // Changed from "file" to "thumbnail"
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
          return res.status(400).json({ error: "No thumbnail uploaded" });
        }

        if (!storageService) {
          return res
            .status(500)
            .json({ error: "Storage service not configured" });
        }

        log.info(
          {
            sessionId,
            fileName: req.file.originalname,
            fileSize: req.file.size,
          },
          "Uploading thumbnail"
        );

        // Upload thumbnail to S3
        const result = await storageService.uploadFile({
          file: req.file.buffer,
          fileName: `thumbnails/${Date.now()}-${req.file.originalname}`,
          mimeType: req.file.mimetype,
        });

        // Store thumbnail URL in session
        session.thumbnailUrl = result.url;
        session.updatedAt = new Date();

        log.info(
          { sessionId, thumbnailUrl: result.url },
          "Thumbnail uploaded successfully"
        );

        return sendSuccess(res, { thumbnailUrl: result.url });
      } catch (error) {
        log.error(
          { err: error, sessionId: req.params["sessionId"] },
          "Thumbnail upload error"
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
        const { fileBuffer: _fileBuffer, ...sessionData } = session;

        return sendSuccess(res, sessionData);
      } catch (error) {
        return next(error);
      }
    }
  );

  // Finalize course creation with uploaded files
  router.post(
    "/sessions/:sessionId/finalize",
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

        if (!session.analysis) {
          return res.status(400).json({
            error: "No course analysis found. Please upload files first.",
          });
        }

        if (!session.fileBuffer) {
          return res.status(400).json({
            error: "No course files found. Please upload files first.",
          });
        }

        if (!storageService) {
          return res
            .status(500)
            .json({ error: "Storage service not configured" });
        }

        if (!courseRepository) {
          return res
            .status(500)
            .json({ error: "Course repository not configured" });
        }

        const {
          courseName,
          courseDescription,
          courseCategory,
          coursePrice,
          thumbnailUrl,
        } = req.body;

        if (!courseName || !courseDescription) {
          return res
            .status(400)
            .json({ error: "Course name and description are required" });
        }

        // Ensure description is at least 10 characters
        if (courseDescription.length < 10) {
          return res.status(400).json({
            error: "Course description must be at least 10 characters",
          });
        }

        log.info(
          { sessionId, courseName },
          "Finalizing course creation - uploading assets and creating course"
        );

        // Parse price - handle both string and number, ensure it's in cents
        let priceInCents: number;
        if (coursePrice) {
          const priceNum = parseFloat(coursePrice);
          // If price is less than 100, assume it's in dollars and convert to cents
          priceInCents =
            priceNum < 100 ? Math.round(priceNum * 100) : Math.round(priceNum);
        } else if (session.analysis.metadata?.suggestedPrice) {
          priceInCents = Math.round(
            session.analysis.metadata.suggestedPrice * 100
          );
        } else {
          priceInCents = 4999; // Default $49.99
        }

        // STEP 1: Create the course first to get courseId
        log.info({ sessionId, courseName }, "Creating course record");

        const newCourse = await courseRepository.create({
          name: courseName,
          description: courseDescription,
          instructorId: req.user!.id,
          category:
            courseCategory ||
            session.analysis.metadata?.suggestedCategory ||
            "Other",
          priceAmount: priceInCents,
          priceCurrency: "USD",
          thumbnailUrl: thumbnailUrl || session.thumbnailUrl,
          manifest: {}, // Will be updated after asset upload
        });

        const courseId = newCourse.id;
        log.info(
          { sessionId, courseId },
          "Course created, now uploading assets"
        );

        // STEP 2: Upload assets to S3 and insert into course_assets table
        const zip = new AdmZip(session.fileBuffer);
        const zipEntries = zip.getEntries();

        // Filter out junk files
        const validExtensions = [
          "mp4",
          "avi",
          "mov",
          "wmv",
          "webm",
          "pdf",
          "doc",
          "docx",
          "txt",
          "md",
        ];
        const junkFiles = [
          ".ds_store",
          "thumbs.db",
          "__macosx",
          ".git",
          ".gitignore",
          "desktop.ini",
        ];

        const uploadedAssets: Map<string, string> = new Map(); // filename -> S3 URL

        for (const entry of zipEntries) {
          if (entry.isDirectory) continue;

          const fileName = entry.entryName;
          const fileNameLower = fileName.toLowerCase();

          // Skip junk files
          const isJunk = junkFiles.some((junk) => fileNameLower.includes(junk));
          if (isJunk) {
            log.debug({ fileName }, "Skipping junk file");
            continue;
          }

          // Skip thumbnail files
          if (
            fileNameLower.includes("thumbnail") ||
            fileNameLower.includes("thumb")
          ) {
            log.debug({ fileName }, "Skipping thumbnail file");
            continue;
          }

          const fileExt = fileName.split(".").pop()?.toLowerCase() || "";

          // Only process files with valid extensions
          if (!validExtensions.includes(fileExt)) {
            log.debug(
              { fileName, fileExt },
              "Skipping file with invalid extension"
            );
            continue;
          }

          const fileBuffer = entry.getData();
          const fileSize = entry.header.size;

          // Extract folder name and base filename
          const pathParts = fileName.split("/");
          const folderName =
            pathParts.length > 1 ? pathParts[pathParts.length - 2] : "";
          const baseFileName = pathParts[pathParts.length - 1] || fileName;

          // Determine MIME type and asset type
          let mimeType = "application/octet-stream";
          let assetType: "VIDEO" | "PDF" | "NOTE" | "OTHER" = "OTHER";

          if (["mp4", "avi", "mov", "wmv", "webm"].includes(fileExt)) {
            mimeType = `video/${fileExt}`;
            assetType = "VIDEO";
          } else if (fileExt === "pdf") {
            mimeType = "application/pdf";
            assetType = "PDF";
          } else if (["doc", "docx", "txt", "md"].includes(fileExt)) {
            if (fileExt === "txt") {
              mimeType = "text/plain";
            } else if (fileExt === "md") {
              mimeType = "text/markdown";
            } else {
              mimeType =
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            }
            assetType = "NOTE";
          }

          // Upload to S3
          const cleanFileName = `${Date.now()}-${baseFileName}`;
          const result = await storageService.uploadFile({
            file: fileBuffer,
            fileName: `courses/${courseId}/${cleanFileName}`,
            mimeType,
          });

          // Store mapping for manifest update
          uploadedAssets.set(baseFileName, result.url);

          // Insert into course_assets table
          try {
            await courseRepository.createAsset({
              courseId,
              assetType,
              fileName: baseFileName,
              fileSize,
              storagePath: result.url,
              mimeType,
              metadata: {
                originalPath: fileName,
                folderName,
                uploadedAt: new Date().toISOString(),
              },
            });

            log.info(
              {
                sessionId,
                courseId,
                fileName: baseFileName,
                folderName,
                url: result.url,
                assetType,
              },
              "Uploaded asset to S3 and inserted into database"
            );
          } catch (dbError) {
            log.error(
              { err: dbError, sessionId, courseId, fileName: baseFileName },
              "Failed to insert asset into database, but S3 upload succeeded"
            );
          }
        }

        log.info(
          { sessionId, courseId, uploadedCount: uploadedAssets.size },
          "All assets uploaded successfully"
        );

        // STEP 3: Build manifest with S3 URLs
        const manifest = {
          modules: session.analysis.sections.map(
            (section: any, index: number) => ({
              id: `module-${index + 1}`,
              title: section.title,
              description: section.description || "",
              order: section.order || index + 1,
              lessons: section.files.map(
                (file: string, lessonIndex: number) => {
                  const fileExt = file.split(".").pop()?.toLowerCase();
                  let type = "OTHER";
                  if (
                    ["mp4", "avi", "mov", "wmv", "webm"].includes(fileExt || "")
                  ) {
                    type = "VIDEO";
                  } else if (fileExt === "pdf") {
                    type = "PDF";
                  } else if (
                    ["doc", "docx", "txt", "md"].includes(fileExt || "")
                  ) {
                    type = "NOTE";
                  }

                  const baseFileName = file.split("/").pop() || file;
                  const s3Url = uploadedAssets.get(baseFileName);

                  return {
                    id: `lesson-${index + 1}-${lessonIndex + 1}`,
                    title: baseFileName,
                    description: "",
                    order: lessonIndex + 1,
                    type,
                    videoUrl: s3Url || "", // Add S3 URL here
                  };
                }
              ),
            })
          ),
          totalDuration: 0,
          totalAssets: uploadedAssets.size,
        };

        log.info(
          {
            sessionId,
            courseId,
            moduleCount: manifest.modules.length,
            totalLessons: manifest.modules.reduce(
              (sum: number, m: any) => sum + m.lessons.length,
              0
            ),
          },
          "Built course manifest with S3 URLs"
        );

        // STEP 4: Update course with manifest
        await courseRepository.update(courseId, {
          manifest,
        });

        log.info({ sessionId, courseId }, "Course updated with manifest");

        // Return course ID and shareable link
        return sendSuccess(res, {
          courseId,
          shareableLink: `/courses/${courseId}`,
        });
      } catch (error) {
        log.error(
          { err: error, sessionId: req.params["sessionId"] },
          "Course finalization error"
        );
        return next(error);
      }
    }
  );

  // Upload course assets from ZIP to S3 and database
  router.post(
    "/sessions/:sessionId/upload-assets/:courseId",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId = req.params["sessionId"] as string;
        const courseId = req.params["courseId"] as string;
        const session = sessions.get(sessionId);

        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        if (session.userId !== req.user!.id) {
          return res.status(403).json({ error: "Unauthorized" });
        }

        if (!session.fileBuffer) {
          return res.status(400).json({
            error: "No course files found. Please upload files first.",
          });
        }

        if (!storageService) {
          return res
            .status(500)
            .json({ error: "Storage service not configured" });
        }

        log.info(
          { sessionId, courseId, fileCount: session.files.length },
          "Starting asset upload to S3"
        );

        // Extract ZIP and upload each file to S3
        const zip = new AdmZip(session.fileBuffer);
        const zipEntries = zip.getEntries();
        const uploadedAssets: Array<{
          fileName: string;
          url: string;
          folderName?: string;
        }> = [];

        // Filter out junk files and only process valid course assets
        const validExtensions = [
          "mp4",
          "avi",
          "mov",
          "wmv",
          "webm",
          "pdf",
          "doc",
          "docx",
          "txt",
          "md",
        ];
        const junkFiles = [
          ".ds_store",
          "thumbs.db",
          "__macosx",
          ".git",
          ".gitignore",
          "desktop.ini",
        ];

        for (const entry of zipEntries) {
          if (entry.isDirectory) continue;

          const fileName = entry.entryName;
          const fileNameLower = fileName.toLowerCase();

          // Skip junk files
          const isJunk = junkFiles.some((junk) => fileNameLower.includes(junk));
          if (isJunk) {
            log.debug({ fileName }, "Skipping junk file");
            continue;
          }

          // Skip thumbnail files
          if (
            fileNameLower.includes("thumbnail") ||
            fileNameLower.includes("thumb")
          ) {
            log.debug({ fileName }, "Skipping thumbnail file");
            continue;
          }

          const fileExt = fileName.split(".").pop()?.toLowerCase() || "";

          // Only process files with valid extensions
          if (!validExtensions.includes(fileExt)) {
            log.debug(
              { fileName, fileExt },
              "Skipping file with invalid extension"
            );
            continue;
          }

          const fileBuffer = entry.getData();
          const fileSize = entry.header.size;

          // Extract folder name (module/section name)
          const pathParts = fileName.split("/");
          const folderName =
            pathParts.length > 1 ? pathParts[pathParts.length - 2] : "";
          const baseFileName = pathParts[pathParts.length - 1] || fileName;

          // Determine MIME type and asset type based on file extension
          let mimeType = "application/octet-stream";
          let assetType: "VIDEO" | "PDF" | "NOTE" | "OTHER" = "OTHER";

          if (["mp4", "avi", "mov", "wmv", "webm"].includes(fileExt)) {
            mimeType = `video/${fileExt}`;
            assetType = "VIDEO";
          } else if (fileExt === "pdf") {
            mimeType = "application/pdf";
            assetType = "PDF";
          } else if (["doc", "docx", "txt", "md"].includes(fileExt)) {
            if (fileExt === "txt") {
              mimeType = "text/plain";
            } else if (fileExt === "md") {
              mimeType = "text/markdown";
            } else {
              mimeType =
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            }
            assetType = "NOTE";
          }

          // Upload to S3 with clean path
          const cleanFileName = `${Date.now()}-${baseFileName}`;
          const result = await storageService.uploadFile({
            file: fileBuffer,
            fileName: `courses/${courseId}/${cleanFileName}`,
            mimeType,
          });

          uploadedAssets.push({
            fileName: baseFileName,
            url: result.url,
            folderName,
          });

          // Insert into course_assets table
          if (courseRepository) {
            try {
              await courseRepository.createAsset({
                courseId,
                assetType,
                fileName: baseFileName,
                fileSize,
                storagePath: result.url,
                mimeType,
                metadata: {
                  originalPath: fileName,
                  folderName,
                  uploadedAt: new Date().toISOString(),
                },
              });

              log.info(
                {
                  sessionId,
                  courseId,
                  fileName: baseFileName,
                  folderName,
                  url: result.url,
                  assetType,
                },
                "Uploaded asset to S3 and inserted into database"
              );
            } catch (dbError) {
              log.error(
                { err: dbError, sessionId, courseId, fileName: baseFileName },
                "Failed to insert asset into database, but S3 upload succeeded"
              );
              // Continue even if database insert fails - S3 upload succeeded
            }
          } else {
            log.info(
              { sessionId, courseId, fileName: baseFileName, url: result.url },
              "Uploaded asset to S3 (database insert skipped - no repository)"
            );
          }
        }

        log.info(
          { sessionId, courseId, uploadedCount: uploadedAssets.length },
          "All assets uploaded successfully"
        );

        return sendSuccess(res, {
          uploadedCount: uploadedAssets.length,
          assets: uploadedAssets,
        });
      } catch (error) {
        log.error(
          {
            err: error,
            sessionId: req.params["sessionId"],
            courseId: req.params["courseId"],
          },
          "Asset upload error"
        );
        return next(error);
      }
    }
  );

  return router;
};
