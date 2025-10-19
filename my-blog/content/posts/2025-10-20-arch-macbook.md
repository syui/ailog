---
title: "macbook air(mid 2011)のarchlinuxでフリーズ対応"
slug: "arch-macbook"
date: "2025-10-20"
tags: ["archlinux", "macbook"]
draft: false
---

今回はmacbook air(mid 2011)のarchlinux運用の話をします。

```sh
$ uname -r
6.12.53-1-lts
```

運用のコツとしては、`linux-lts`を使うこと。`linux-firmware`を入れないこと。`broadcom-wl`を入れること。

```sh
$ pacman -S linux-lts linux-lts-headers broadcom-wl
$ grub-mkconfig -o /boot/grub/grub.cfg
---
$ pacman -Qq | grep "^linux-firmware" | sudo pacman -R -
$ mkinitcpio -P
```

```sh:/etc/pacman.conf
IgnorePkg   = linux linux-headers
```

## usbからの実行

```sh
$ mount /dev/sda2 /mnt
$ mount /dev/sda1 /mnt/boot
$ arch-chroot /mnt
```
