---
title: "blenderで作ったモデルを改良した"
slug: "ue-blender-model"
date: "2025-09-18"
tags: ["ue", "blender"]
draft: false
---

blenderで作ったモデルは、ueで動かしてみると、なかなか思ったとおりに動かないことは多いです。原因も多種多様で、とても一言では言い表せない。

今まで気になっていたところは以下の2点でした。

1. 指がちゃんと動かない
2. 衣装のすり抜けが気になる

## 指を修正するにはueからblenderへ

blenderで作ったモデルは指がぎこちない動きで、複数の要因が関係しています。特に大きいのが手動で塗っていたウェイトペイント。

しかし、これを完璧に塗り、かつueで動作確認するのはよくありません。なぜなら、blenderとueで動きが異なるからです。それも全く異なるわけではなく微妙に合わないのです。

ということで、ueでまず指の動きがちゃんとできているモデルをblenderに持ってきて、手の部分を移植するというのが今回採用した方法です。

- o: `ue -> blender`
- x: `blender -> ue`

![](/img/ue_blender_model_ai_v0701.png)

![](/img/ue_blender_model_ai_v0702.png)

動きを見るのは、vrm4uの`RTG_UEFN_${name}`を使用します。

## スカートと足の動きを関連付ける

衣装は、`Spine`以下にあるワンピースなので、厳密にはスカートではありませんが、スカートということにします。

このスカートは、3d-modelでは非常に厄介なもので、足の動きに追従できず体に入り込んでしまうのです。

これを解消するためには様々な方法があり、たとえblenderの機能を使って解消しても、ueでは効果がありません。よって、こちらもueから解消するのがベストです。

今回、ABPに`Look At`を使うことで解消しました。

```sh
[Look At]
- Bone to Modify: スカート前、中央
- Look at Target: Spine (中心)

[Look At]
- Bone to Modify: スカート前、左
- Look at Target: LeftLeg (左足)

[Look At]
- Bone to Modify: スカート前、右
- Look at Target: RightLeg (右足)
```

`Look at Location`の位置は調整してください。私の場合は`0, 50, 0`です。

<iframe width="100%" height="415" src="https://www.youtube.com/embed/3o98Aivn--0?rel=0&showinfo=0&controls=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

完璧ではないけど、これでもかなり改良されたほう。

## 実践投入

### unique skillのデザインを考える

まず、アイのunique skill(ユニークスキル)のデザインを考えました。

1. カメラワークは正面に移動
2. スロー再生を開始
3. 忍術のようなモーション
4. カメラを通常に戻す
5. 属性攻撃の範囲ダメージ

### tatoolsを使って忍術モーションを実装

[tatools](https://www.fab.com/ja/listings/a5d3b60d-b886-4564-bf6d-15d46a8d27fe)を使います。

[https://github.com/threepeatgames/ThreepeatAnimTools](https://github.com/threepeatgames/ThreepeatAnimTools)

使い方は簡単ですが、動画が分かりづらいので、ポイントだけ解説します。pluginの起動、既存のアニメーションの修正、保存です。

1. pluginの起動は、`/Engine/Plugins/ThreepeatAnimTools/Picker/ThreepeatAnimTools_CR_Picker`を起動します。アウトライナーにでもウィンドウを追加しましょう。
2. 修正したいアニメーション(アニメシーケンス)を開いて、`シーケンサで編集 -> コントロールリグにベイク -> CR_UEFNMannyTatoolsRig`します。
3. これでlevel(map)上でレベルシーケンスを開けます。
4. ここからが修正ですが、まず、例えば、腕を選択して向きを変えたとしましょう。これだけでは保存されません。もとに戻ってしまいます。ここで、(1)シーケンサの下にあるアニメーションを削除し、(2)選択している部位のすべてのコンマを削除します。再生してみると編集したとおりになります。
5. 保存は、シーケンサのメニューバーにある保存ボタン(現在のシーケンスとサブシーケンスを保存)を押します。すると、参照したアニメシーケンスが編集したとおりに動きます。

![](https://ue-book.syui.ai/img/0016.png)

### 実戦動画

<iframe width="100%" height="415" src="https://www.youtube.com/embed/tJQ1y-8p1hQ?rel=0&showinfo=0&controls=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

