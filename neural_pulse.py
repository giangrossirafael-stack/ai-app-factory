
import asyncio
import os
import subprocess
import textwrap

import edge_tts
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

OUTPUT = "output"
WIDTH, HEIGHT = 1080, 1920
FPS = 24

SCENES = [
    ("O QUE É UM", "AGENTE DE IA?"),
    ("NÃO É APENAS", "UM CHATBOT."),
    ("ELE RECEBE", "UM OBJETIVO."),
    ("PLANEJA E", "EXECUTA TAREFAS."),
    ("USA FERRAMENTAS", "E TOMA DECISÕES."),
    ("É UMA NOVA ERA", "DA INTELIGÊNCIA ARTIFICIAL."),
]

SCRIPT = (
    "Você sabe o que é um agente de inteligência artificial? "
    "Diferente de um chatbot comum, ele pode receber um objetivo, "
    "planejar etapas, utilizar ferramentas e executar tarefas. "
    "Por exemplo: pesquisar informações, organizar dados e ajudar "
    "a realizar atividades. Os agentes de IA estão transformando "
    "a maneira como trabalhamos. Neural Pulse Brasil. "
    "Inteligência artificial que transforma o futuro."
)

async def create_voice():
    voice = edge_tts.Communicate(
        SCRIPT,
        "pt-BR-FranciscaNeural",
        rate="+5%"
    )
    await voice.save(f"{OUTPUT}/narracao.mp3")

def font(size):
    path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    return ImageFont.truetype(path, size)

def create_scene(line1, line2, index):
    image = Image.new("RGB", (WIDTH, HEIGHT), "#071426")
    draw = ImageDraw.Draw(image)

    draw.rectangle((0, 0, WIDTH, 18), fill="#16D9FF")
    draw.text((75, 100), "NEURAL PULSE BRASIL",
              font=font(43), fill="#43DFFF")

    draw.rounded_rectangle(
        (65, 570, 1015, 1300),
        radius=45,
        fill="#102B48",
        outline="#16D9FF",
        width=5
    )

    for text, y in [(line1, 760), (line2, 920)]:
        box = draw.textbbox((0, 0), text, font=font(76))
        x = (WIDTH - (box[2] - box[0])) // 2
        draw.text((x, y), text, font=font(76), fill="white")

    draw.text(
        (75, 1660),
        "IA QUE TRANSFORMA O FUTURO",
        font=font(34),
        fill="#43DFFF"
    )

    draw.text(
        (75, 1780),
        f"NEURAL PULSE  |  {index + 1}/{len(SCENES)}",
        font=font(28),
        fill="#AFC5DC"
    )

    image.save(f"{OUTPUT}/frame_{index:03d}.png")

def main():
    os.makedirs(OUTPUT, exist_ok=True)

    asyncio.run(create_voice())

    for i, (line1, line2) in enumerate(SCENES):
        create_scene(line1, line2, i)

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

    command = [
        ffmpeg, "-y",
        "-framerate", "1",
        "-i", f"{OUTPUT}/frame_%03d.png",
        "-i", f"{OUTPUT}/narracao.mp3",
        "-vf", "scale=1080:1920,fps=24,format=yuv420p",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        "-movflags", "+faststart",
        f"{OUTPUT}/neural-pulse-short.mp4"
    ]

    subprocess.run(command, check=True)

    print("Vídeo criado:", f"{OUTPUT}/neural-pulse-short.mp4")

if __name__ == "__main__":
    main()
