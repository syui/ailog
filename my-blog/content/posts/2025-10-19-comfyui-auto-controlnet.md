---
title: "comfyuiを自動化する"
slug: "comfyui-auto-controlnet"
date: "2025-10-19"
tags: ["comfyui"]
draft: false
---

今回は、`comfyui`の自動化を紹介します。

## comfyuiの自動化手順

以下の機能を使用します。

1. `Apply InstantID`: 顔を指定します。
2. `Apply ControlNet`: ポーズを指定します。

まずこちらのworkflowを読み込むと早く書けます。workflowは通常、comfyuiで作られた画像に記録されています。

[https://docs.comfy.org/tutorials/controlnet/pose-controlnet-2-pass](https://docs.comfy.org/tutorials/controlnet/pose-controlnet-2-pass)

ここから`Apply InstantID`を追加します。`Apply ControlNet`から`positive`, `negative`を`InstantID`と`KSampler`につなぎます。

```md
[ControlNet] -> [InstantID] -> [KSampler]
```

自動化には以下のノードを使います。

1. `Batch Image Loop Open`: loop処理を作れます。
2. `Load Image Batch From Dir`: 画像をディレクトリから読み込みます。
3. `LogicUtil_Uniform Random Choice`: ランダムで区切り文字を選択します。loop中にpromptの中身を変えます。

なお、`comfyui`の外部ノードは以下を使用しています。

- comfyui_instantid
- loop-image
- comfyui-inspire-pack


自動化の手順としては、まず、ポーズをディレクトリに保存しておき、`Load Image Batch From Dir`で読み込みます。`Batch Image Loop Open`につなぎます。それを`Apply ControlNet`につなぎます。

最終的に`KSampler`から`VAE Decode`をつなぎ、そこから`Batch Image Loop Close`でループを閉じます。

もしここで保存したければ、`VAE Decode`を`Save Image`にも繋いでおきます。

```md
[Load Image Batch From Dir] -> [Batch Image Loop Open] -> 

[ControlNet] -> [InstantID] -> [KSampler] -> 

[VAE Decode] -> [Batch Image Loop Close]
```

[![](/img/comfyui_instantid_controlnet_0001.png)](/img/comfyui_instantid_controlnet_0001.png)
[![](/img/comfyui_instantid_controlnet_0002.png)](/img/comfyui_instantid_controlnet_0002.png)
[![](/img/comfyui_instantid_controlnet_0003.png)](/img/comfyui_instantid_controlnet_0003.png)
[![](/img/comfyui_instantid_controlnet_0004.png)](/img/comfyui_instantid_controlnet_0004.png)


## comfyuiの便利なノード

`filename_prefix`で`Get Date Time String(JPS)`を使用しています。これでファイル名が重複しづらくなります。

役立つ外部ノードです。

- comfy-image-saver
- JPS-Nodes
- comfyui-custom-scripts

例えば、loop中にpromptをランダムで変える処理を追加しています。これは`LogicUtil_Uniform Random Choice`で実現しており、区切り文字は`,`です。

```md
background: city street,
background: cloud sky,
background: galaxy planet,
```

## ポーズの作成手順

例えば、自作ゲーム動画を保存し、`ffmepg`で画像化します。

```sh
$ ffmpeg -i input.mp4 output%04d.png
```

その画像を使って、ポーズを作成することができます。

- `OpenPose Pose`: `comfyui_controlnet_aux`

[![](/img/comfyui_instantid_controlnet_0005.png)](/img/comfyui_instantid_controlnet_0005.png)

