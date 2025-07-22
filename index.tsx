/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";

// WARNING: Storing your API key in client-side code is not secure
// and can lead to misuse. This is for demonstration purposes only.
const API_KEY = "AIzaSyAWvlOrlQHzJ2T-pFLIzyDepNuc1pO6EZE";

// --- DOM ELEMENT REFERENCES ---
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
const imagePreviewContainer = document.getElementById('image-preview-container') as HTMLDivElement;
const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
const clearImageBtn = document.getElementById('clear-image-btn') as HTMLButtonElement;
const imageCountSelect = document.getElementById('image-count') as HTMLSelectElement;
const aspectRatioContainer = document.querySelector('.aspect-ratio-buttons') as HTMLDivElement;
const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
const resultsGallery = document.getElementById('results-gallery') as HTMLElement;
const btnText = generateBtn.querySelector('.btn-text') as HTMLSpanElement;
const spinner = generateBtn.querySelector('.spinner') as HTMLDivElement;

// --- STATE ---
let uploadedImageBase64: string | null = null;
let uploadedImageMimeType: string | null = null;
const ai = new GoogleGenAI({ apiKey: API_KEY });

// --- EVENT LISTENERS ---
fileUpload.addEventListener('change', handleFileChange);
clearImageBtn.addEventListener('click', clearImage);
aspectRatioContainer.addEventListener('click', handleAspectRatioChange);
generateBtn.addEventListener('click', handleGeneration);

// --- FUNCTIONS ---

/**
 * Handles the file input change event.
 * Reads the selected image, displays a preview, and stores its base64 data.
 */
function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (file) {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // result is a data URL: "data:image/jpeg;base64,...."
      const [mimeTypePart, base64Part] = result.split(';');
      uploadedImageMimeType = mimeTypePart.split(':')[1];
      uploadedImageBase64 = base64Part.split(',')[1];

      imagePreview.src = result;
      imagePreviewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }
}

/**
 * Clears the uploaded image preview and stored data.
 */
function clearImage() {
  uploadedImageBase64 = null;
  uploadedImageMimeType = null;
  fileUpload.value = ''; // Reset file input
  imagePreviewContainer.classList.add('hidden');
  imagePreview.src = '#';
}

/**
 * Handles clicks on aspect ratio buttons to manage the active state.
 */
function handleAspectRatioChange(event: MouseEvent) {
    const target = event.target as HTMLButtonElement;
    if (target.classList.contains('aspect-ratio-btn')) {
        aspectRatioContainer.querySelectorAll('.aspect-ratio-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        target.classList.add('active');
    }
}

/**
 * Toggles the loading state of the UI.
 * @param isLoading - Whether to show the loading state.
 */
function setLoading(isLoading: boolean) {
  generateBtn.disabled = isLoading;
  spinner.classList.toggle('hidden', !isLoading);
  btnText.classList.toggle('hidden', isLoading);
}

/**
 * Displays an error message in the results gallery.
 * @param message - The error message to display.
 */
function displayError(message: string) {
  resultsGallery.innerHTML = `<p class="error-text">Error: ${message}</p>`;
}

/**
 * Main handler for the "Generate" button click.
 * This now calls the Gemini API directly from the client.
 */
async function handleGeneration() {
  const userPrompt = promptInput.value.trim();
  if (!userPrompt && !uploadedImageBase64) {
    displayError('Please enter a prompt or upload an image.');
    return;
  }

  setLoading(true);
  resultsGallery.innerHTML = ''; // Clear previous results

  const numberOfImages = parseInt(imageCountSelect.value, 10);
  const aspectRatio = (aspectRatioContainer.querySelector('.active') as HTMLElement)?.dataset.ratio || '1:1';
  
  let finalPrompt = userPrompt;

  try {
    // Step 1: If an image is provided, generate a detailed prompt from it.
    if (uploadedImageBase64 && uploadedImageMimeType) {
      const imagePart: Part = {
        inlineData: {
          mimeType: uploadedImageMimeType,
          data: uploadedImageBase64,
        },
      };

      const systemPrompt = `You are an expert art director who creates prompts for image generation models. Your goal is to transform user requests (an image and/or text) into a perfect prompt.

**Your Primary Mode (Artwork Extraction):**
By default, analyze an uploaded image that contains artwork on a physical object (like a card).
1.  **Analyze the Artwork:** Identify core visual elements (e.g., flowers, patterns), artistic style (e.g., watercolor), and color palette.
2.  **Ignore the Context:** You MUST completely disregard the physical object itself (the paper), its surroundings (e.g., a table, pencils), and any existing text.
3.  **Generate a Prompt for a New Scene:** Create a prompt for a new, full-screen image or pattern inspired by ONLY the artwork.

**Example (Artwork Extraction):**
- **User provides:** Image of a floral card on a table.
- **Your output prompt:** "A beautiful watercolor floral arrangement with soft pink and lavender roses, accented with delicate green leaves and splatters of gold glitter, on a clean off-white background."

---

**Exception Mode (Object Creation):**
If the user's text prompt explicitly asks to create a specific object like a "card", "invitation", "poster", "flyer", or "mockup", you MUST switch modes.
1.  **Honor the User's Request:** Your goal is to design the object the user asked for.
2.  **Use Image as Inspiration:** Use the artwork, style, and colors from the uploaded image as the design theme for the new object.
3.  **Generate a Prompt for the Object:** Create a prompt that describes the final object clearly.

**Example (Object Creation):**
- **User provides:** Image of a floral card AND text "create a birthday invitation card".
- **Your output prompt:** "A full-size HD birthday invitation card featuring elegant watercolor flowers. The design is clean and modern, with a sophisticated font, on a textured off-white background. The scene is a flat lay, studio shot with no other objects in view."

**Crucial Rules for Both Modes:**
- Your final output is ONLY the new prompt. Do not add conversational text.
- If the user provides text to include (like names or dates), seamlessly integrate it into the design description.`;

      const contents: Part[] = [
        imagePart,
        ...(userPrompt ? [{ text: `The user's specific request is: "${userPrompt}"` }] : []),
      ];

      const promptGenResponse: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts: contents },
        config: {
          systemInstruction: systemPrompt,
        },
      });
      finalPrompt = promptGenResponse.text;
    }

    if (!finalPrompt) {
      throw new Error("Could not generate a creative prompt from the inputs.");
    }
    
    // Step 2: Generate images using the final prompt.
    const imageGenResponse = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: finalPrompt,
      config: {
        numberOfImages: numberOfImages,
        aspectRatio: aspectRatio,
        outputMimeType: "image/jpeg",
      },
    });

    if (imageGenResponse?.generatedImages?.length > 0) {
      imageGenResponse.generatedImages.forEach((generatedImage) => {
          if (generatedImage.image?.imageBytes) {
              const src = `data:image/jpeg;base64,${generatedImage.image.imageBytes}`;
              const img = new Image();
              img.src = src;
              img.alt = finalPrompt; // Use the final prompt for better accessibility
              resultsGallery.appendChild(img);
          }
      });
    } else {
        displayError('The model did not return any images. Try a different prompt.');
    }

  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    displayError(`Failed to generate images. ${errorMessage}`);
  } finally {
    setLoading(false);
  }
}