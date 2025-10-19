---
title: "gpt-ossを使用する"
slug: "lms-gpt-oss"
date: "2025-10-19"
tags: ["openai", "AI", "windows"]
draft: false
---

今回は、openaiの[gpt-oss](https://huggingface.co/openai/gpt-oss-120b)を使用する方法です。

https://openai.com/ja-JP/index/introducing-gpt-oss/

`120b`, `20b`があります。好きな方を使いましょう。ここでは`20b`を使用します。

```sh
$ ollama run gpt-oss:20b
or
$ lms get openai/gpt-oss-20b
```

今回は、lms(LM Studio)で使用します。

```sh
# https://lmstudio.ai/
$ pip install lmstudio

# https://huggingface.co/openai/gpt-oss-20b
$ lms get openai/gpt-oss-20b
```

今後、家庭のpcは、gpu(nvidia, amd)を積んで`lms`で`gpt-oss`を動かすのが一般的になりそう。

## サービスとして公開する

例えば、apiとして公開することもでき、それを自身のサービス上から利用するなどの使い方があります。なお、`lms`にもこのような機能はあります。

```sh
# https://cookbook.openai.com/articles/gpt-oss/run-transformers
$ transformers serve
$ transformers chat localhost:8000 --model-name-or-path openai/gpt-oss-20b
---
$ curl -X POST http://localhost:8000/v1/responses -H "Content-Type: application/json" -d '{"messages": [{"role": "system", "content": "hello"}], "temperature": 0.9, "max_tokens": 1000, "stream": true, "model": "openai/gpt-oss-20b"}'
```

```sh
$ cloudflared tunnel login
$ cloudflared tunnel create gpt-oss-tunnel
```

```yml:~/.cloudflared/config.yml
tunnel: 1234
credentials-file: ~/.cloudflared/1234.json

ingress:
  - hostname: example.com
    service: http://localhost:8000
  - service: http_status:404
```

```sh
$ cloudflared tunnel run gpt-oss-tunnel
```

ただ、apiのreqにはキーとか設定しておいたほうがいいかも。

## 高速、大規模に使うには

`vllm`を使います。linuxが最適です。gpu(nvidia-cuda)がないときついので、win + wslで動かします。nvidiaの`H100`や`DGX Spark`が必要になると思います。

cudaはcomfyuiで使っている`cu129`に合わせました。

```sh
$ wsl --install archlinux
$ wsl -d archlinux
$ nvidia-smi
```

```sh
$ mkdir ~/.config/openai/gpt-oss
$ cd ~/.config/openai/gpt-oss
$ python -m venv venv
$ source venv/bin/activate

$ pip install --upgrade pip
$ pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu129
$ pip install vllm transformers

$ python -m vllm.entrypoints.openai.api_server \
    --model openai/gpt-oss-20b \
    --port 8000 \
```

```sh
$ curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-oss-20b",
    "messages": [{"role": "user", "content": "こんにちは！"}]
  }'
```

## お金の使い道

最近、iphoneやmacを買うより、`DGX Spark`を買ったほうが良いのではないかと考えることがあります。

pc(RTX)やmacは、60万円ほどかかりますし、それは`DGX Spark`の値段と同じです。どうせ同じ値段を使うなら、何を買うのが良いのでしょう。

パソコンのスペックというのは、毎年それほど変わりません。RTXにしても同じです。

とするなら、既に持っているものではなく、持っていないスパコンを購入し、そこにAIをホストしたり、あるいは性能を今のpcから利用する事を考えたほうが良いのではないか。

最近はそんなことをよく考えます。

今後はpcを買う時代ではなく、スパコンを買う時代に突入するかもしれません。

