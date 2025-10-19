---
title: "plamo-2で翻訳する"
slug: "lms-plamo-2"
date: "2025-10-19"
tags: ["lms", "AI", "windows"]
draft: false
---

今回は、`lms`で[pfnet/plamo-2-translate](https://huggingface.co/pfnet/plamo-2-translate)を使用する方法です。

![](/img/lms_plamo2_0001.png)

- [https://huggingface.co/mmnga/plamo-2-translate-gguf](https://huggingface.co/mmnga/plamo-2-translate-gguf)
- [https://huggingface.co/mmnga/plamo-2-translate-gguf/discussions/1/files](https://huggingface.co/mmnga/plamo-2-translate-gguf/discussions/1/files)

`lms`で`mmnga/plamo-2-translate-gguf`をdownloadして読み込みます。

次に、`discussions/1`にある`en2ja.preset.json`, `ja2en.preset.json`のファイルを保存するなり、作成して、それをプリセットからインポートします。

```sh
$ curl -sL "https://huggingface.co/mmnga/plamo-2-translate-gguf/raw/refs%2Fpr%2F1/plamo%202%20translate%20en2ja.preset.json" > en2ja.preset.json
$ curl -sL "https://huggingface.co/mmnga/plamo-2-translate-gguf/raw/refs%2Fpr%2F1/plamo%202%20translate%20ja2en.preset.json" > ja2en.preset.json
```

