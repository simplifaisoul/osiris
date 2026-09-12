import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export async function GET() {
  try {
    const publicDir = join(process.cwd(), 'public');
    const imgPath = join(publicDir, 'banana_generated.png');
    const jsonPath = join(publicDir, 'banana_ocr_result.json');

    const videoPath = join(publicDir, 'banana_generated.mp4');

    const imageExists = existsSync(imgPath);
    const videoExists = existsSync(videoPath);
    let ocrResults = [];

    if (existsSync(jsonPath)) {
      try {
        ocrResults = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      } catch {}
    }

    return NextResponse.json({
      status: 'ok',
      imageUrl: imageExists ? '/banana_generated.png' : null,
      videoUrl: videoExists ? '/banana_generated.mp4' : null,
      ocrEngine: 'GitHub EasyOCR (JaidedAI/EasyOCR - 23k+ Stars)',
      vlmModel: 'Apple MLX-VLM (Qwen2-VL-7B 4-bit)',
      videoModel: 'GitHub Lightricks/LTX-Video & Motion Engine (24fps H.264)',
      ocrResults
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    let prompt = '황금빛 바나나 시네마틱 렌더링';
    let motion = 'zoom';

    try {
      const body = await req.json();
      if (body.prompt && body.prompt.trim()) {
        prompt = body.prompt.trim();
      }
      if (body.motion) {
        motion = body.motion;
      }
    } catch {}

    const timestamp = Date.now();
    const outputFilename = `video_${timestamp}.mp4`;
    const publicDir = join(process.cwd(), 'public');
    const outputPath = join(publicDir, outputFilename);

    const { execSync } = await import('child_process');
    const safePrompt = prompt.replace(/"/g, '\\"');
    execSync(
      `source /Users/ohmylove303naver.com/mlx-env/bin/activate && python /Users/ohmylove303naver.com/custom_video_maker.py --prompt "${safePrompt}" --motion "${motion}" --output "${outputPath}"`,
      { shell: '/bin/zsh' }
    );

    return NextResponse.json({
      status: 'ok',
      videoUrl: `/${outputFilename}`,
      prompt,
      motion,
      message: '새 동영상이 성공적으로 생성되었습니다.'
    });
  } catch (err: any) {
    console.error('Video generation error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
