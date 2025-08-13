---
title: "ue5でdualsenseを使う"
slug: "ps5-controller"
date: "2025-09-07"
tags: ["ue"]
draft: false
---

ps5-controllerは`dualsense`というらしい。ue5で使うには、以下のpluginを使います。fabかgithubのreleaseからpluginフォルダに入れてbuildするか2つの方法があります。

## dualsense plugin

- [https://github.com/rafaelvaloto/WindowsDualsenseUnreal](https://github.com/rafaelvaloto/WindowsDualsenseUnreal)
- [https://github.com/rafaelvaloto/GamepadCoOp](https://github.com/rafaelvaloto/GamepadCoOp)

![](/img/ue_ps5_controller_v0100.jpg)

`v1.2.10`からmultiplayを意識した`GamepadCoOp`との統合が行われました。

コントローラーのライトをキャラクター切り替え時に変更する処理を入れました。

<iframe src="https://blueprintue.com/render/tx_q1evf" scrolling="no" allowfullscreen style="width:100%;height:400px"></iframe>

## dualsenseの分解

最近、ドリフト問題が発生していたこともあり、何度も分解していました。

よって、このタイプのコントローラーなら簡単に修理できるようになりました。

今後も`dualsense`を使用していく可能性は高いですね。

