import { pipeline, RawImage, env } from '@xenova/transformers';

let classifier: any = null;

env.allowLocalModels = false;
env.useBrowserCache = false;

async function loadModel() {
  try {
    document.getElementById('result')!.innerText = 'Loading AI model...';
    classifier = await pipeline(
      'image-classification',
      'Xenova/quickdraw-mobilevit-small', { quantized: false }
    );
    
    document.getElementById('result')!.innerText = 'Model loaded! Upload an image.';
  } catch (error) {
    console.error('Error loading model:', error);
    document.getElementById('result')!.innerText = 'Failed to load model!';
  }
}

document.getElementById('upload')!.addEventListener('change', async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  document.getElementById('result')!.innerText = 'Classifying...';

  try {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const imgData = reader.result as string;

      const rawImage = await RawImage.read(imgData);
      const processedImage = rawImage.grayscale();
      const predictions = await classifier(processedImage);

      console.log('Predictions:', predictions);

      const resultElement = document.createElement('div');
      if (Array.isArray(predictions) && predictions.length > 0) {
        resultElement.innerHTML = predictions
          .slice(0, 3)
          .map((p) => `Prediction: ${p.label} (${(p.score * 100).toFixed(2)}%)`)
          .join('<br>');

       document.getElementById('result')!.innerText = 'Classified!';

      } else {
        resultElement.innerText = `Prediction: No match found`;
      }

      document.getElementById('result')!.appendChild(resultElement);
    };
  } catch (error) {
    console.error('Classification error:', error);
    document.getElementById('result')!.innerText = 'Error in classification!';
  }
});

loadModel();