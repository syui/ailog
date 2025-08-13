---
title: "comfyuiでフィギュア化する"
slug: "comfyui"
date: "2025-09-11"
tags: ["comfyui"]
draft: false
---

`gemini`でnano bananaというフィギュア化が流行っています。今回は、それを`comfyui`で再現してみようと思います。

# comfyui

```sh
$ git clone https://github.com/comfyanonymous/ComfyUI
$ cd ComfyUI
$ winget install python.python.3.13
$ pip uninstall torch torchaudio
$ pip install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu129
$ pip install -r requirements.txt
$ python main.py
```

もしvenvを使用する場合

```sh
$ python -m venv venv
$ pip install -r requirements.txt
$ python main.py
```

## flux-1-kontext-dev

[https://docs.comfy.org/tutorials/flux/flux-1-kontext-dev](https://docs.comfy.org/tutorials/flux/flux-1-kontext-dev)

基本的にcomfyuiで作成した画像にはworkflowが保存されています。ですから、画像があればpromptやbypassなども含めて生成情報がわかります。情報が削除されていない限りは再現することが可能です。

今回は、`flux-1-kontext-dev`を使用します。

```sh
$ curl -sLO https://raw.githubusercontent.com/Comfy-Org/example_workflows/main/flux/kontext/dev/flux_1_kontext_dev_basic.png 
```

```sh
📂 ComfyUI/
├── 📂 models/
│   ├── 📂 diffusion_models/
│   │   └── flux1-dev-kontext_fp8_scaled.safetensors
│   ├── 📂 vae/
│   │   └── ae.safetensor
│   └── 📂 text_encoders/
│       ├── clip_l.safetensors
│       └── t5xxl_fp16.safetensors or t5xxl_fp8_e4m3fn_scaled.safetensors
```

[msg content="prompt: Convert to collectible figure style: detailed sculpting, premium paint job, professional product photography, studio lighting, pristine condition, commercial quality, toy photography aesthetic"]

以下は`wan2.1`で生成した時の動画。

![](/img/comfyui_wan21_0001.webp)

![](/img/comfyui_flex1_nano_banana_0001.png)

できました。
