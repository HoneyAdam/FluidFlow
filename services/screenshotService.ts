/**
 * Screenshot Service
 *
 * Manages project screenshots - capturing, saving, and retrieving.
 * Screenshots are stored in the project folder and referenced in project metadata.
 */

import { projectApi } from './projectApi';
import type { ScreenshotMeta, ProjectScreenshots } from './api/types';

// Re-export types for convenience
export type { ScreenshotMeta, ProjectScreenshots };

// Default max history
const DEFAULT_MAX_HISTORY = 5;

// Thumbnail size - use larger size for better quality
const THUMBNAIL_WIDTH = 1280;
const THUMBNAIL_HEIGHT = 720;

/**
 * Generate a unique screenshot ID
 */
function generateScreenshotId(): string {
  return `ss_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Create a thumbnail from a data URL
 */
function createThumbnail(dataUrl: string, maxWidth = THUMBNAIL_WIDTH, maxHeight = THUMBNAIL_HEIGHT): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculate thumbnail dimensions maintaining aspect ratio
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      // Create canvas and draw
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      // Use PNG for lossless quality
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

/**
 * Convert data URL to Blob
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0]?.match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(parts[1] ?? '');
  const n = bstr.length;
  const u8arr = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }

  return new Blob([u8arr], { type: mime });
}

/**
 * Save screenshot to project
 */
export async function saveScreenshot(
  projectId: string,
  dataUrl: string,
  options: {
    width: number;
    height: number;
    format?: 'png' | 'jpeg' | 'webp';
  }
): Promise<ScreenshotMeta> {
  const id = generateScreenshotId();
  const format = options.format || 'png';
  const filename = `screenshot_${Date.now()}.${format}`;

  // Use original image directly - no resizing, 100% quality
  // The UI will handle 4:3 display with CSS object-fit

  // Convert to blob for size calculation
  const blob = dataUrlToBlob(dataUrl);

  const metadata: ScreenshotMeta = {
    id,
    filename,
    width: options.width,
    height: options.height,
    format,
    size: blob.size,
    capturedAt: Date.now(),
    thumbnail: dataUrl, // Store full-quality original, no resizing
  };

  // Save screenshot file to project
  try {
    await projectApi.saveFile(projectId, `.fluidflow/${filename}`, dataUrl);
    console.log('[Screenshot] Saved:', filename);
  } catch (error) {
    console.error('[Screenshot] Save failed:', error);
    throw error;
  }

  return metadata;
}

/**
 * Update project metadata with screenshot info
 */
export async function updateProjectScreenshot(
  projectId: string,
  screenshot: ScreenshotMeta
): Promise<void> {
  try {
    // Read current project.json
    const projectJsonPath = '.fluidflow/project.json';
    let projectData: Record<string, unknown> = {};

    try {
      const existing = await projectApi.readFile(projectId, projectJsonPath);
      if (existing) {
        projectData = JSON.parse(existing);
      }
    } catch {
      // File doesn't exist yet, start fresh
    }

    // Initialize screenshots if needed
    if (!projectData.screenshots) {
      projectData.screenshots = {
        latest: null,
        history: [],
        maxHistory: DEFAULT_MAX_HISTORY,
      };
    }

    const screenshots = projectData.screenshots as ProjectScreenshots;

    // Add current latest to history
    if (screenshots.latest) {
      screenshots.history.unshift(screenshots.latest);
      // Trim history to max
      while (screenshots.history.length > (screenshots.maxHistory || DEFAULT_MAX_HISTORY)) {
        const removed = screenshots.history.pop();
        // Optionally delete old screenshot file
        if (removed) {
          try {
            await projectApi.deleteFile(projectId, `.fluidflow/${removed.filename}`);
          } catch {
            // Ignore deletion errors
          }
        }
      }
    }

    // Set new latest
    screenshots.latest = screenshot;
    projectData.screenshots = screenshots;
    projectData.lastScreenshot = screenshot.capturedAt;

    // Save project.json
    await projectApi.saveFile(projectId, projectJsonPath, JSON.stringify(projectData, null, 2));
    console.log('[Screenshot] Project metadata updated');
  } catch (error) {
    console.error('[Screenshot] Metadata update failed:', error);
    throw error;
  }
}

/**
 * Get project screenshots
 */
export async function getProjectScreenshots(projectId: string): Promise<ProjectScreenshots | null> {
  try {
    const projectJsonPath = '.fluidflow/project.json';
    const content = await projectApi.readFile(projectId, projectJsonPath);

    if (content) {
      const projectData = JSON.parse(content);
      return projectData.screenshots || null;
    }
  } catch {
    // File doesn't exist
  }

  return null;
}

/**
 * Get latest screenshot thumbnail
 */
export async function getLatestThumbnail(projectId: string): Promise<string | null> {
  const screenshots = await getProjectScreenshots(projectId);
  return screenshots?.latest?.thumbnail || null;
}

/**
 * Delete a screenshot
 */
export async function deleteScreenshot(projectId: string, screenshotId: string): Promise<void> {
  const screenshots = await getProjectScreenshots(projectId);
  if (!screenshots) return;

  // Find and remove from history
  const index = screenshots.history.findIndex((s) => s.id === screenshotId);
  if (index !== -1) {
    const removed = screenshots.history.splice(index, 1)[0];
    if (removed) {
      try {
        await projectApi.deleteFile(projectId, `.fluidflow/${removed.filename}`);
      } catch {
        // Ignore
      }
    }
  }

  // Check if it's the latest
  if (screenshots.latest?.id === screenshotId) {
    try {
      await projectApi.deleteFile(projectId, `.fluidflow/${screenshots.latest.filename}`);
    } catch {
      // Ignore
    }
    // Promote from history if available
    screenshots.latest = screenshots.history.shift() || undefined;
  }

  // Update metadata
  await updateProjectMetadata(projectId, { screenshots });
}

/**
 * Update project metadata helper
 */
async function updateProjectMetadata(
  projectId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const projectJsonPath = '.fluidflow/project.json';
  let projectData: Record<string, unknown> = {};

  try {
    const existing = await projectApi.readFile(projectId, projectJsonPath);
    if (existing) {
      projectData = JSON.parse(existing);
    }
  } catch {
    // Start fresh
  }

  Object.assign(projectData, updates);
  await projectApi.saveFile(projectId, projectJsonPath, JSON.stringify(projectData, null, 2));
}

/**
 * Capture screenshot from iframe
 */
export function requestScreenshotCapture(
  iframe: HTMLIFrameElement,
  options?: { format?: 'png' | 'jpeg' | 'webp'; quality?: number }
): void {
  iframe.contentWindow?.postMessage(
    {
      type: 'CAPTURE_SCREENSHOT',
      options: options || {},
    },
    '*'
  );
}

/**
 * Screenshot service singleton
 */
export const screenshotService = {
  save: saveScreenshot,
  updateProject: updateProjectScreenshot,
  getProjectScreenshots,
  getLatestThumbnail,
  delete: deleteScreenshot,
  requestCapture: requestScreenshotCapture,
  createThumbnail,
};

export default screenshotService;
