import { Worker, Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";
import ApiKey from "../models/ApiKey.js";
import Notification from "../models/Notification.js";

// ========== Queues ==========

export const apiKeyRotationQueue = redisConnection
    ? new Queue("api-key-rotation", { connection: redisConnection })
    : null;

// ========== Rotation Worker ==========
// Runs every hour — checks for keys due for rotation and handles transition cleanups

export const apiKeyRotationWorker = redisConnection
    ? new Worker(
        "api-key-rotation",
        async (job) => {
            console.log(`🔑 API Key Rotation: checking for keys...`);
            
            let rotatedCount = 0;
            let cleanedUpCount = 0;

            try {
                // 1. Handle Automatic Rotation
                const dueForRotation = await ApiKey.getDueForRotation();
                console.log(`🔑 API Key Rotation: found ${dueForRotation.length} keys due for rotation.`);

                for (const key of dueForRotation) {
                    try {
                        const newKey = await ApiKey.rotate(key.id, 1); // 1 day transition by default
                        
                        // Notify user
                        await Notification.create({
                            user_id: key.user_id,
                            title: "API Key Automatically Rotated",
                            body: `Your API key "${key.name}" has been automatically rotated for security. The old key will remain active for 24 hours. Please update your applications with the new key.`,
                        });
                        
                        rotatedCount++;
                        console.log(`✅ API Key Rotation: rotated key #${key.id}`);
                    } catch (error) {
                        console.error(`❌ API Key Rotation: failed to rotate key #${key.id}:`, error.message);
                    }
                }

                // 2. Handle Transition Cleanup
                cleanedUpCount = await ApiKey.cleanupExpiredTransitions();
                if (cleanedUpCount > 0) {
                    console.log(`🧹 API Key Rotation: cleaned up ${cleanedUpCount} expired transition keys.`);
                }

            } catch (error) {
                console.error(`💥 API Key Rotation Worker Error:`, error.message);
                throw error;
            }

            return { rotated: rotatedCount, cleanedUp: cleanedUpCount };
        },
        {
            connection: redisConnection,
            concurrency: 1,
        }
    )
    : null;

// ========== Event Handlers ==========

if (apiKeyRotationWorker) {
    apiKeyRotationWorker.on("completed", (job, result) => {
        console.log(`✅ API Key Rotation worker completed:`, JSON.stringify(result));
    });
    apiKeyRotationWorker.on("failed", (job, err) => {
        console.error(`💥 API Key Rotation worker failed:`, err.message);
    });
}
