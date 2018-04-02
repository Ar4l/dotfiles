;;; private/aru/config.el -*- lexical-binding: t; -*-

;; ui
(setq doom-theme 'doom-tomorrow-night)
(setq doom-font (font-spec :family "Source Code Pro" :size 13 :weight 'light))
(setq doom-big-font (font-spec :family "Source Code Pro" :size 15 :weight 'normal))
(setq doom-line-numbers-style nil)

;; org
(setq org-ellipsis " ▼ ")

;; editing
(add-hook! text-mode 'auto-fill-mode)
