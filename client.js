/**
 * 技能分类中心 · Client 端（Web / React）
 *
 * 只负责渲染与交互；所有磁盘读写通过 host 的 /api/dsh-skill-categories/* 路由完成。
 * 侧栏入口：sidebar.panellist -> id="skill-categories"
 * 主面板：main -> key="skill-categories"
 */
window.__ModuleLoader__.load({
  id: "dsh-skill-categories",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    const PANEL_ID = "skill-categories";
    const NS = "dsh-skill-categories";
    const STORAGE_COLLAPSED = "dsh.skill-categories.collapsed.v1";
    const API = {
      list: "api/dsh-skill-categories/list",
      save: "api/dsh-skill-categories/save",
      reset: "api/dsh-skill-categories/reset",
      health: "api/dsh-skill-categories/health",
    };

    const SOURCE_LABELS = {
      "user-dsh": "用户技能",
      "user-agents": "用户技能",
      "project-dsh": "项目技能",
      "project-agents": "项目技能",
      bundled: "系统内置",
      runtime: "运行时",
      custom: "自定义",
    };

    const DICTIONARY = {
      zh: {
        "entry.label": "技能分类",
        "hero.kicker": "SKILL CATEGORIES",
        "hero.title": "技能分类中心",
        "hero.subtitle":
          "按分类折叠浏览全部技能。拖拽技能到分类即可归类；分类数据与 skill-hub 共用，界面分类就是模型按类调用的分类。",
        "action.refresh": "刷新",
        "action.new": "新建分类",
        "action.reset": "恢复默认",
        "action.expandAll": "全部展开",
        "action.collapseAll": "全部收起",
        "stats.classes": "分类",
        "stats.total": "技能总数",
        "stats.classified": "已归类",
        "stats.unclassified": "未分类",
        "search.placeholder": "搜索技能名称 / 描述 / 使用场景…",
        "filter.allSources": "全部来源",
        "filter.onlyUnclassified": "只看未分类",
        "section.unclassified": "未分类",
        "section.dropHint": "拖拽技能到此处归类",
        "row.moveTo": "移至",
        "row.modelHidden": "模型不可见",
        "row.userHidden": "用户不可调用",
        "row.whenToUse": "何时使用",
        "row.path": "路径",
        "dialog.createTitle": "新建分类",
        "dialog.renameTitle": "重命名分类",
        "dialog.deleteTitle": "删除分类",
        "dialog.label": "分类名称",
        "dialog.icon": "图标（emoji）",
        "dialog.key": "分类标识（英文 / 数字 / 连字符）",
        "dialog.cancel": "取消",
        "dialog.create": "创建",
        "dialog.save": "保存",
        "dialog.delete": "删除",
        "dialog.deleteBody":
          "删除后，这个分类下的技能会回到「未分类」，不会删除任何技能文件。",
        "toast.saved": "已保存并同步 skill-hub",
        "toast.savedLocal": "已保存，但 skill-hub 同步失败",
        "toast.reset": "已从 skill-hub 恢复默认分类",
        "empty.search": "没有匹配的技能",
        "footer.storage": "分类文件",
        "footer.hub": "skill-hub",
        "footer.synced": "已连接",
        "loading": "正在读取技能与分类…",
      },
      en: {
        "entry.label": "Skill Categories",
        "hero.kicker": "SKILL CATEGORIES",
        "hero.title": "Skill Categories",
        "hero.subtitle":
          "Browse every skill in collapsible categories. Drag a skill onto a category to classify it. Categories are shared with skill-hub.",
        "action.refresh": "Refresh",
        "action.new": "New category",
        "action.reset": "Reset to default",
        "action.expandAll": "Expand all",
        "action.collapseAll": "Collapse all",
        "stats.classes": "Categories",
        "stats.total": "Skills",
        "stats.classified": "Classified",
        "stats.unclassified": "Unclassified",
        "search.placeholder": "Search name / description / when to use…",
        "filter.allSources": "All sources",
        "filter.onlyUnclassified": "Only unclassified",
        "section.unclassified": "Unclassified",
        "section.dropHint": "Drop a skill here to classify it",
        "row.moveTo": "Move to",
        "row.modelHidden": "Model hidden",
        "row.userHidden": "User hidden",
        "row.whenToUse": "When to use",
        "row.path": "Path",
        "dialog.createTitle": "New category",
        "dialog.renameTitle": "Rename category",
        "dialog.deleteTitle": "Delete category",
        "dialog.label": "Category name",
        "dialog.icon": "Icon (emoji)",
        "dialog.key": "Category key (letters / digits / hyphen)",
        "dialog.cancel": "Cancel",
        "dialog.create": "Create",
        "dialog.save": "Save",
        "dialog.delete": "Delete",
        "dialog.deleteBody":
          "Skills in this category will move back to Unclassified. No skill file is deleted.",
        "toast.saved": "Saved and synced to skill-hub",
        "toast.savedLocal": "Saved, but skill-hub sync failed",
        "toast.reset": "Default categories restored from skill-hub",
        "empty.search": "No matching skills",
        "footer.storage": "Categories file",
        "footer.hub": "skill-hub",
        "footer.synced": "connected",
        "loading": "Loading skills and categories…",
      },
    };

    let runtimeT;
    function dictionary() {
      const english =
        typeof document !== "undefined" &&
        (document.documentElement.lang || "zh").toLowerCase().startsWith("en");
      return english ? DICTIONARY.en : DICTIONARY.zh;
    }
    function setRuntimeTranslate(fn) {
      runtimeT = fn;
    }
    function tt(key, values) {
      let text =
        runtimeT !== undefined ? runtimeT(key, values) : dictionary()[key] ?? key;
      if (values !== undefined) {
        for (const [name, value] of Object.entries(values)) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
      }
      return text;
    }

    /** 统一 API 请求；document-relative 路径以兼容子路径部署。 */
    async function request(path, options = {}) {
      const init = {
        method: options.method ?? "GET",
        headers: {
          accept: "application/json",
          ...(options.body !== undefined
            ? { "content-type": "application/json" }
            : {}),
        },
        credentials: "same-origin",
      };
      if (options.body !== undefined) init.body = JSON.stringify(options.body);
      const response = await fetch(path, init);
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error(`HTTP ${response.status}`);
      }
      if (!response.ok || payload?.ok === false) {
        throw new Error(
          payload?.error?.message ?? payload?.error ?? `HTTP ${response.status}`,
        );
      }
      return payload;
    }

    function classNames(...values) {
      return values.filter(Boolean).join(" ");
    }

    function reapplyCategories(skills, classes) {
      const categoryOf = new Map();
      for (const item of classes) {
        for (const skillName of item.skills) {
          if (!categoryOf.has(skillName)) categoryOf.set(skillName, item.key);
        }
      }
      return skills.map((skill) => ({
        ...skill,
        category: categoryOf.get(skill.name) ?? null,
      }));
    }

    function countSkills(skills, classes) {
      const classified = skills.filter((skill) => skill.category !== null).length;
      return {
        total: skills.length,
        classified,
        unclassified: skills.length - classified,
        classes: classes.length,
      };
    }

    function stripClass(item) {
      return {
        key: item.key,
        label: item.label,
        icon: item.icon,
        order: item.order,
        skills: [...item.skills],
      };
    }

    function sourceLabel(source) {
      return SOURCE_LABELS[source] ?? source ?? "自定义";
    }

    function sourceTone(source) {
      if (source === "bundled") return "builtin";
      if (source === "runtime") return "runtime";
      if (source === "project-dsh" || source === "project-agents") {
        return "project";
      }
      if (source === "user-dsh" || source === "user-agents") return "user";
      return "custom";
    }

    const CSS = `
.skc-page{height:100%;min-height:0;width:calc(100vw - 410px);max-width:calc(100vw - 410px);min-width:0;overflow:auto;overflow-x:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,system-ui,-apple-system,"Segoe UI",sans-serif);padding:22px 26px 46px;box-sizing:border-box}
.skc-shell{width:100%;min-width:0;max-width:1220px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.skc-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:12px 18px;padding:8px 2px 2px;flex-wrap:wrap}
.skc-hero-copy{min-width:0}
.skc-kicker{font-size:10.5px;letter-spacing:.18em;font-weight:700;color:var(--dsw-alias-label-tertiary);text-transform:uppercase;margin-bottom:5px}
.skc-title{font-size:25px;line-height:1.2;font-weight:750;margin:0;letter-spacing:-.02em}
.skc-subtitle{margin:7px 0 0;max-width:760px;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.65}
.skc-hero-actions{display:flex;gap:8px;flex:none;align-items:center;padding-top:3px}
.skc-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:9px;padding:7px 13px;font-size:12.5px;font-weight:550;cursor:pointer;font-family:inherit;transition:background .15s,border-color .15s,transform .1s;white-space:nowrap}
.skc-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l1)}
.skc-btn:active:not(:disabled){transform:translateY(1px)}
.skc-btn:disabled{opacity:.45;cursor:default}
.skc-btn-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:transparent}
.skc-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover);border-color:transparent}
.skc-btn-danger{color:var(--dsw-alias-state-error-primary)}
.skc-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.skc-stat{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:13px;padding:12px 15px;display:flex;align-items:baseline;gap:8px;box-shadow:0 1px 0 rgba(0,0,0,.02)}
.skc-stat-num{font-size:24px;font-weight:750;letter-spacing:-.03em;line-height:1}
.skc-stat-label{color:var(--dsw-alias-label-secondary);font-size:11.5px}
.skc-stat[data-accent="brand"] .skc-stat-num{color:var(--dsw-alias-state-business-primary)}
.skc-stat[data-accent="warn"] .skc-stat-num{color:var(--dsw-alias-state-warn-primary)}
.skc-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:13px;padding:10px 12px;position:sticky;top:0;z-index:8;box-shadow:0 6px 18px -14px rgba(0,0,0,.35)}
.skc-search-wrap{position:relative;flex:0 1 280px;width:280px;min-width:180px;max-width:280px}
.skc-search{width:100%;box-sizing:border-box;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-2));border:1px solid var(--dsw-alias-border-l2);border-radius:9px;outline:none;padding:8px 11px 8px 32px;font-size:12.5px;font-family:inherit}
.skc-search:focus{border-color:var(--dsw-alias-state-business-primary)}
.skc-search::placeholder{color:var(--dsw-alias-label-tertiary)}
.skc-search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--dsw-alias-label-tertiary);font-size:14px;pointer-events:none}
.skc-chips{display:flex;flex-wrap:wrap;gap:5px}
.skc-chip{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;padding:4px 10px;font-size:11.5px;line-height:1.45;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit}
.skc-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.skc-chip[data-active="true"]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-interactive-bg-hover)}
.skc-chip-count{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}
.skc-check{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:11.5px;cursor:pointer;user-select:none;white-space:nowrap}
.skc-check input{accent-color:var(--dsw-alias-state-business-primary);margin:0}
.skc-toolbar-spacer{flex:1}
.skc-toolbar-tools{display:flex;align-items:center;justify-content:flex-start;gap:12px;flex-wrap:wrap;flex:1 0 100%;margin-left:0}
.skc-tool-link{appearance:none;border:none;background:transparent;color:var(--dsw-alias-state-business-primary);font-size:11.5px;cursor:pointer;padding:3px 4px;font-family:inherit}
.skc-tool-link:hover{text-decoration:underline}
.skc-saving{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.skc-banner{border:1px solid var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);border-radius:10px;padding:9px 13px;font-size:12px;line-height:1.55;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 6%,transparent)}
.skc-banner[data-kind="error"]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 6%,transparent)}
.skc-list{display:flex;flex-direction:column;gap:10px}
.skc-section{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:14px;overflow:hidden;transition:border-color .15s,box-shadow .15s,background .15s}
.skc-section[data-drop="true"]{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 4%,var(--dsw-alias-bg-layer-1))}
.skc-section-head{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;user-select:none;transition:background .14s}
.skc-section-head:hover{background:var(--dsw-alias-interactive-bg-hover)}
.skc-caret{width:16px;height:16px;flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);transition:transform .16s;font-size:11px}
.skc-caret[data-open="true"]{transform:rotate(90deg)}
.skc-cat-icon{width:30px;height:30px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);display:inline-flex;align-items:center;justify-content:center;font-size:16px;flex:none;border:1px solid var(--dsw-alias-border-l1)}
.skc-cat-copy{min-width:0;display:flex;flex-direction:column;gap:2px}
.skc-cat-label{font-size:13.5px;font-weight:650;line-height:1.25}
.skc-cat-key{font-size:10px;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code,ui-monospace,monospace)}
.skc-cat-count{margin-left:2px;font-size:11px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 8px;line-height:1.55}
.skc-cat-actions{margin-left:auto;display:flex;gap:3px;opacity:0;transition:opacity .14s}
.skc-section-head:hover .skc-cat-actions{opacity:1}
.skc-icon-btn{appearance:none;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-tertiary);border-radius:7px;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;font-family:inherit}
.skc-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}
.skc-icon-btn[data-danger]:hover{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.skc-section-body{border-top:1px solid var(--dsw-alias-border-l1)}
.skc-skill{display:flex;align-items:flex-start;gap:14px;padding:13px 16px 13px 20px;border-bottom:1px solid var(--dsw-alias-border-l1);transition:background .12s;position:relative}
.skc-skill:last-child{border-bottom:none}
.skc-skill:hover{background:var(--dsw-alias-interactive-bg-hover)}
.skc-skill[data-dragging="true"]{opacity:.45}
.skc-grip{color:var(--dsw-alias-label-tertiary);cursor:grab;font-size:14px;line-height:1.5;flex:none;user-select:none;letter-spacing:-2px}
.skc-grip:active{cursor:grabbing}
.skc-skill-main{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}
.skc-skill-title-row{display:flex;align-items:center;flex-wrap:wrap;gap:7px}
.skc-skill-name{font-size:13px;font-weight:650;font-family:var(--ds-font-family-code,ui-monospace,monospace);letter-spacing:-.01em}
.skc-badge{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 7px;font-size:10px;line-height:1.6;white-space:nowrap}
.skc-badge[data-tone="user"]{color:var(--dsw-alias-state-business-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent)}
.skc-badge[data-tone="builtin"]{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
.skc-badge[data-tone="runtime"]{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,transparent)}
.skc-badge[data-tone="project"]{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 45%,transparent)}
.skc-badge[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,transparent)}
.skc-desc{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.skc-when{margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.skc-when b{color:var(--dsw-alias-label-secondary);font-weight:600}
.skc-path{margin-top:2px;color:var(--dsw-alias-label-tertiary);font-size:10px;font-family:var(--ds-font-family-code,ui-monospace,monospace);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.skc-move{flex:none;display:flex;align-items:center;gap:6px;padding-top:2px}
.skc-move-label{font-size:10.5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.skc-select{appearance:none;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-2));border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 24px 5px 8px;font-size:11.5px;font-family:inherit;cursor:pointer;max-width:150px;background-image:linear-gradient(45deg,transparent 50%,var(--dsw-alias-label-tertiary) 50%),linear-gradient(135deg,var(--dsw-alias-label-tertiary) 50%,transparent 50%);background-position:calc(100% - 13px) calc(50% - 1px),calc(100% - 8px) calc(50% - 1px);background-size:5px 5px,5px 5px;background-repeat:no-repeat}
.skc-select:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.skc-empty{padding:22px 16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px}
.skc-drop-hint{margin:8px 12px 12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:11.5px}
.skc-loading{padding:60px 20px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px}
.skc-spinner{display:inline-block;width:15px;height:15px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-state-business-primary);border-radius:50%;animation:skc-spin .8s linear infinite;vertical-align:-3px;margin-right:8px}
@keyframes skc-spin{to{transform:rotate(360deg)}}
.skc-footer{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;color:var(--dsw-alias-label-tertiary);font-size:10.5px;padding:6px 3px 0}
.skc-footer code{font-family:var(--ds-font-family-code,ui-monospace,monospace);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:1px 5px;font-size:10px}
.skc-footer-dot{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-state-success-primary);display:inline-block;margin-right:5px}
.skc-overlay{position:fixed;inset:0;background:rgba(10,12,16,.42);backdrop-filter:blur(3px);z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px}
.skc-modal{width:min(440px,100%);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;box-shadow:0 24px 70px -24px rgba(0,0,0,.55);overflow:hidden}
.skc-modal-head{padding:17px 20px 0}
.skc-modal-title{font-size:16px;font-weight:700;margin:0}
.skc-modal-body{padding:14px 20px 4px;display:flex;flex-direction:column;gap:12px}
.skc-modal-note{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6;margin:0}
.skc-field{display:flex;flex-direction:column;gap:5px}
.skc-field-label{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.skc-input{width:100%;box-sizing:border-box;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-2));border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:8px 10px;font-size:12.5px;font-family:inherit;outline:none}
.skc-input:focus{border-color:var(--dsw-alias-state-business-primary)}
.skc-input:disabled{opacity:.55}
.skc-row2{display:grid;grid-template-columns:76px 1fr;gap:10px}
.skc-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:16px 20px 18px}
.skc-toast{position:fixed;right:26px;bottom:24px;z-index:1400;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:10px;padding:10px 15px;box-shadow:0 16px 40px -20px rgba(0,0,0,.45);font-size:12.5px;display:flex;align-items:center;gap:8px;max-width:420px;animation:skc-toast-in .2s ease-out}
.skc-toast[data-kind="ok"]{border-color:var(--dsw-alias-state-success-primary)}
.skc-toast[data-kind="error"]{border-color:var(--dsw-alias-state-error-primary)}
.skc-toast[data-kind="warn"]{border-color:var(--dsw-alias-state-warn-primary)}
@keyframes skc-toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (max-width:820px){.skc-stats{grid-template-columns:repeat(2,1fr)}.skc-hero{flex-direction:column}.skc-hero-actions{padding-top:0}.skc-skill{flex-direction:column;gap:8px}.skc-move{padding-left:26px}}
`;

    const CSS_TAG = "dsh-skill-categories/panel.css";
    function ensureCss() {
      if (typeof document === "undefined") return;
      const existing = document.querySelector(
        `style[data-plugin-css=${JSON.stringify(CSS_TAG)}]`,
      );
      if (existing !== null) {
        if (existing.textContent !== CSS) existing.textContent = CSS;
        return;
      }
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-skill-categories";
      tag.dataset.pluginCss = CSS_TAG;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    function SidebarIcon({ size = 18, active }) {
      return h(
        "svg",
        {
          "data-dsh-panel-entry": PANEL_ID,
          viewBox: "0 0 16 16",
          width: size,
          height: size,
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "1.3",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
          style: { opacity: active ? 1 : 0.9 },
        },
        h("path", {
          d: "M2.2 4.1c0-.7.6-1.3 1.3-1.3h2.1l1.1 1.3h4.8c.7 0 1.3.6 1.3 1.3v6.4c0 .7-.6 1.3-1.3 1.3H3.5c-.7 0-1.3-.6-1.3-1.3V4.1z",
        }),
        h("path", { d: "M4.6 7.2h6.8M4.6 9.6h4.9" }),
      );
    }

    function Stat({ num, label, accent }) {
      return h(
        "div",
        { className: "skc-stat", "data-accent": accent },
        h("span", { className: "skc-stat-num" }, num),
        h("span", { className: "skc-stat-label" }, label),
      );
    }

    function Badge({ tone, children }) {
      return h("span", { className: "skc-badge", "data-tone": tone }, children);
    }

    function SkillRow({ skill, classes, onMove, onDragStart, onDragEnd, saving }) {
      const [dragging, setDragging] = useState(false);
      return h(
        "div",
        {
          className: "skc-skill",
          "data-dragging": dragging ? "true" : "false",
          draggable: !saving,
          onDragStart: (event) => {
            setDragging(true);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", skill.name);
            onDragStart?.(skill.name);
          },
          onDragEnd: () => {
            setDragging(false);
            onDragEnd?.();
          },
        },
        h("span", { className: "skc-grip", title: "拖拽到分类" }, "⠿"),
        h(
          "div",
          { className: "skc-skill-main" },
          h(
            "div",
            { className: "skc-skill-title-row" },
            h("span", { className: "skc-skill-name" }, skill.name),
            h(
              Badge,
              { tone: sourceTone(skill.source) },
              sourceLabel(skill.source),
            ),
            skill.modelInvocable
              ? null
              : h(Badge, { tone: "warn" }, tt("row.modelHidden")),
            skill.userInvocable
              ? null
              : h(Badge, { tone: "warn" }, tt("row.userHidden")),
          ),
          h(
            "p",
            { className: "skc-desc", title: skill.description },
            skill.description,
          ),
          skill.whenToUse
            ? h(
                "p",
                { className: "skc-when", title: skill.whenToUse },
                h("b", null, `${tt("row.whenToUse")} `),
                skill.whenToUse,
              )
            : null,
          skill.path
            ? h("div", { className: "skc-path", title: skill.path }, skill.path)
            : null,
        ),
        h(
          "label",
          { className: "skc-move" },
          h("span", { className: "skc-move-label" }, tt("row.moveTo")),
          h(
            "select",
            {
              className: "skc-select",
              value: skill.category ?? "",
              disabled: saving,
              onChange: (event) => onMove(skill.name, event.target.value || null),
            },
            h("option", { value: "" }, tt("section.unclassified")),
            classes.map((item) =>
              h("option", { key: item.key, value: item.key }, item.label),
            ),
          ),
        ),
      );
    }

    function Modal({ title, children, footer, onClose }) {
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
      }, [onClose]);
      return h(
        "div",
        {
          className: "skc-overlay",
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose?.();
          },
        },
        h(
          "div",
          { className: "skc-modal", role: "dialog", "aria-modal": "true" },
          h("div", { className: "skc-modal-head" }, h("h2", { className: "skc-modal-title" }, title)),
          h("div", { className: "skc-modal-body" }, children),
          h("div", { className: "skc-modal-foot" }, footer),
        ),
      );
    }

    function CategoryDialog({ mode, initial, busy, onCancel, onSubmit }) {
      const [label, setLabel] = useState(initial?.label ?? "");
      const [icon, setIcon] = useState(initial?.icon ?? "📁");
      const [key, setKey] = useState(
        initial?.key ??
          `cat-${Math.random().toString(36).slice(2, 6)}`,
      );
      const [keyTouched, setKeyTouched] = useState(mode === "rename");
      const isRename = mode === "rename";
      const submit = () => {
        const cleanLabel = label.trim();
        if (cleanLabel === "") return;
        onSubmit({ label: cleanLabel, icon: icon.trim() || "📁", key: key.trim() });
      };
      return h(
        Modal,
        {
          title: tt(isRename ? "dialog.renameTitle" : "dialog.createTitle"),
          onClose: onCancel,
          footer: [
            h(
              "button",
              { key: "cancel", className: "skc-btn", onClick: onCancel },
              tt("dialog.cancel"),
            ),
            h(
              "button",
              {
                key: "ok",
                className: "skc-btn skc-btn-primary",
                disabled: busy || label.trim() === "",
                onClick: submit,
              },
              tt(isRename ? "dialog.save" : "dialog.create"),
            ),
          ],
        },
        h(
          "label",
          { className: "skc-field" },
          h("span", { className: "skc-field-label" }, tt("dialog.label")),
          h("input", {
            className: "skc-input",
            value: label,
            autoFocus: true,
            placeholder: "例如：数据分析",
            onChange: (event) => {
              const value = event.target.value;
              setLabel(value);
              if (!keyTouched) {
                const slug = value
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-+|-+$/g, "");
                if (slug !== "") setKey(slug.slice(0, 40));
              }
            },
            onKeyDown: (event) => {
              if (event.key === "Enter") submit();
            },
          }),
        ),
        h(
          "div",
          { className: "skc-row2" },
          h(
            "label",
            { className: "skc-field" },
            h("span", { className: "skc-field-label" }, tt("dialog.icon")),
            h("input", {
              className: "skc-input",
              value: icon,
              maxLength: 8,
              onChange: (event) => setIcon(event.target.value),
            }),
          ),
          h(
            "label",
            { className: "skc-field" },
            h("span", { className: "skc-field-label" }, tt("dialog.key")),
            h("input", {
              className: "skc-input",
              value: key,
              disabled: isRename,
              placeholder: "data-analysis",
              onChange: (event) => {
                setKeyTouched(true);
                setKey(event.target.value);
              },
            }),
          ),
        ),
      );
    }

    function DeleteDialog({ item, count, busy, onCancel, onConfirm }) {
      return h(
        Modal,
        {
          title: tt("dialog.deleteTitle"),
          onClose: onCancel,
          footer: [
            h(
              "button",
              { key: "cancel", className: "skc-btn", onClick: onCancel },
              tt("dialog.cancel"),
            ),
            h(
              "button",
              {
                key: "ok",
                className: "skc-btn skc-btn-primary skc-btn-danger",
                disabled: busy,
                onClick: onConfirm,
              },
              tt("dialog.delete"),
            ),
          ],
        },
        h(
          "p",
          { className: "skc-modal-note" },
          `确定删除「${item.icon} ${item.label}」吗？当前包含 ${count} 个技能。`,
        ),
        h("p", { className: "skc-modal-note" }, tt("dialog.deleteBody")),
      );
    }

    function Toast({ toast }) {
      if (!toast) return null;
      return h(
        "div",
        { className: "skc-toast", "data-kind": toast.kind },
        h("span", null, toast.text),
      );
    }

    function PanelPage() {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(null);
      const [query, setQuery] = useState("");
      const [source, setSource] = useState("all");
      const [onlyUnclassified, setOnlyUnclassified] = useState(false);
      const [collapsed, setCollapsed] = useState(() => {
        try {
          const raw = localStorage.getItem(STORAGE_COLLAPSED);
          const parsed = raw === null ? [] : JSON.parse(raw);
          return new Set(Array.isArray(parsed) ? parsed : []);
        } catch {
          return new Set();
        }
      });
      const [dialog, setDialog] = useState(null);
      const [busy, setBusy] = useState(false);
      const [toast, setToast] = useState(null);
      const [dragOver, setDragOver] = useState(null);
      const [dragging, setDragging] = useState(null);

      const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
          const payload = await request(API.list);
          setData(payload);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          if (!silent) setLoading(false);
        }
      }, []);

      useEffect(() => {
        ensureCss();
        load();
      }, [load]);

      useEffect(() => {
        try {
          localStorage.setItem(
            STORAGE_COLLAPSED,
            JSON.stringify([...collapsed]),
          );
        } catch {
          // ignore
        }
      }, [collapsed]);

      useEffect(() => {
        if (!toast) return undefined;
        const timer = setTimeout(() => setToast(null), 2800);
        return () => clearTimeout(timer);
      }, [toast]);

      const classes = data?.classes ?? [];
      const skills = data?.skills ?? [];
      const counts = data?.counts ?? { total: 0, classified: 0, unclassified: 0, classes: 0 };

      const sourceOptions = useMemo(() => {
        const map = new Map();
        for (const skill of skills) {
          map.set(skill.source, (map.get(skill.source) ?? 0) + 1);
        }
        return [...map.entries()].sort((a, b) => b[1] - a[1]);
      }, [skills]);

      const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return skills.filter((skill) => {
          if (source !== "all" && skill.source !== source) return false;
          if (onlyUnclassified && skill.category !== null) return false;
          if (q === "") return true;
          return (
            skill.name.toLowerCase().includes(q) ||
            skill.description.toLowerCase().includes(q) ||
            skill.whenToUse.toLowerCase().includes(q)
          );
        });
      }, [skills, query, source, onlyUnclassified]);

      const categoryCounts = useMemo(() => {
        const map = new Map();
        for (const skill of skills) {
          if (skill.category !== null) {
            map.set(skill.category, (map.get(skill.category) ?? 0) + 1);
          }
        }
        return map;
      }, [skills]);

      const sections = useMemo(() => {
        const base = classes.map((item) => ({
          ...item,
          allCount: categoryCounts.get(item.key) ?? 0,
          skills: filtered.filter((skill) => skill.category === item.key),
        }));
        const uncategorized = filtered.filter((skill) => skill.category === null);
        const uncatSection = {
          key: "__uncategorized",
          label: tt("section.unclassified"),
          icon: "📥",
          order: 999,
          allCount: skills.filter((skill) => skill.category === null).length,
          skills: uncategorized,
          unclassified: true,
        };
        if (onlyUnclassified) return [uncatSection];
        const visible = base.filter(
          (item) =>
            item.skills.length > 0 ||
            (query.trim() === "" && source === "all"),
        );
        if (uncategorized.length > 0 || query.trim() === "") {
          visible.push(uncatSection);
        }
        return visible;
      }, [classes, filtered, categoryCounts, skills, query, source, onlyUnclassified]);

      const toggleCollapsed = useCallback((key) => {
        setCollapsed((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      }, []);

      const applyLocalClasses = useCallback((nextClasses) => {
        setData((prev) => {
          if (!prev) return prev;
          const nextSkills = reapplyCategories(prev.skills, nextClasses);
          return {
            ...prev,
            classes: nextClasses,
            skills: nextSkills,
            counts: countSkills(nextSkills, nextClasses),
          };
        });
      }, []);

      const persist = useCallback(
        async (nextClasses) => {
          setBusy(true);
          applyLocalClasses(nextClasses);
          try {
            const payload = await request(API.save, {
              method: "POST",
              body: {
                classes: nextClasses.map(stripClass),
                syncHub: true,
              },
            });
            const savedClasses = payload.classes ?? nextClasses;
            applyLocalClasses(savedClasses);
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    warning: payload.hubSynced
                      ? null
                      : `skill-hub 同步失败：${payload.hubError ?? "未知错误"}`,
                  }
                : prev,
            );
            setToast({
              kind: payload.hubSynced ? "ok" : "warn",
              text: payload.hubSynced ? tt("toast.saved") : tt("toast.savedLocal"),
            });
          } catch (err) {
            setToast({
              kind: "error",
              text: err instanceof Error ? err.message : String(err),
            });
            await load(true);
          } finally {
            setBusy(false);
          }
        },
        [applyLocalClasses, load],
      );

      const moveSkill = useCallback(
        (skillName, toKey) => {
          if (!data) return;
          const next = data.classes.map((item) => ({
            ...item,
            skills: item.skills.filter((name) => name !== skillName),
          }));
          if (toKey) {
            const index = next.findIndex((item) => item.key === toKey);
            if (index < 0) return;
            next[index] = {
              ...next[index],
              skills: [...next[index].skills, skillName],
            };
          }
          persist(next);
        },
        [data, persist],
      );

      const handleDrop = useCallback(
        (event, key) => {
          event.preventDefault();
          event.stopPropagation();
          setDragOver(null);
          const skillName =
            event.dataTransfer.getData("text/plain") || dragging;
          if (!skillName) return;
          moveSkill(skillName, key === "__uncategorized" ? null : key);
        },
        [dragging, moveSkill],
      );

      const handleCreate = async (value) => {
        if (!data) return;
        if (classes.some((item) => item.key === value.key)) {
          setToast({ kind: "error", text: `分类标识「${value.key}」已存在` });
          return;
        }
        const next = [
          ...classes,
          {
            key: value.key,
            label: value.label,
            icon: value.icon,
            order: classes.length + 1,
            skills: [],
          },
        ];
        setDialog(null);
        await persist(next);
      };

      const handleRename = async (value) => {
        if (!data || !dialog?.item) return;
        const next = classes.map((item) =>
          item.key === dialog.item.key
            ? { ...item, label: value.label, icon: value.icon }
            : item,
        );
        setDialog(null);
        await persist(next);
      };

      const handleDelete = async () => {
        if (!data || !dialog?.item) return;
        const key = dialog.item.key;
        const next = classes
          .filter((item) => item.key !== key)
          .map((item, index) => ({ ...item, order: index + 1 }));
        setDialog(null);
        await persist(next);
      };

      const handleReset = async () => {
        setBusy(true);
        try {
          const payload = await request(API.reset, { method: "POST", body: {} });
          applyLocalClasses(payload.classes ?? []);
          setToast({ kind: "ok", text: tt("toast.reset") });
          await load(true);
        } catch (err) {
          setToast({
            kind: "error",
            text: err instanceof Error ? err.message : String(err),
          });
        } finally {
          setBusy(false);
        }
      };

      const expandAll = () => setCollapsed(new Set());
      const collapseAll = () =>
        setCollapsed(new Set(sections.map((item) => item.key)));

      const storageSource =
        data?.storage?.source === "categories"
          ? "skill-categories.json"
          : data?.storage?.source === "skill-hub"
            ? "skill-hub/skill-classes.json（默认）"
            : "空分类";

      return h(
        "div",
        { className: "skc-page", "data-dsh-skill-categories-view": "" },
        h(
          "div",
          { className: "skc-shell" },
          h(
            "header",
            { className: "skc-hero" },
            h(
              "div",
              { className: "skc-hero-copy" },
              h("div", { className: "skc-kicker" }, tt("hero.kicker")),
              h("h1", { className: "skc-title" }, tt("hero.title")),
              h("p", { className: "skc-subtitle" }, tt("hero.subtitle")),
            ),
            h(
              "div",
              { className: "skc-hero-actions" },
              h(
                "button",
                {
                  className: "skc-btn",
                  onClick: () => load(),
                  disabled: loading || busy,
                  title: "重新读取技能与分类",
                },
                tt("action.refresh"),
              ),
              h(
                "button",
                {
                  className: "skc-btn skc-btn-primary",
                  onClick: () => setDialog({ type: "create" }),
                  disabled: loading || busy,
                },
                `＋ ${tt("action.new")}`,
              ),
            ),
          ),
          h(
            "div",
            { className: "skc-stats" },
            h(Stat, {
              num: counts.classes,
              label: tt("stats.classes"),
              accent: "brand",
            }),
            h(Stat, { num: counts.total, label: tt("stats.total") }),
            h(Stat, { num: counts.classified, label: tt("stats.classified") }),
            h(Stat, {
              num: counts.unclassified,
              label: tt("stats.unclassified"),
              accent: "warn",
            }),
          ),
          h(
            "div",
            { className: "skc-toolbar" },
            h(
              "div",
              { className: "skc-search-wrap" },
              h("span", { className: "skc-search-icon" }, "⌕"),
              h("input", {
                className: "skc-search",
                value: query,
                placeholder: tt("search.placeholder"),
                onChange: (event) => setQuery(event.target.value),
              }),
            ),
            h(
              "div",
              { className: "skc-chips" },
              h(
                "button",
                {
                  className: "skc-chip",
                  "data-active": source === "all" ? "true" : "false",
                  onClick: () => setSource("all"),
                },
                tt("filter.allSources"),
                h("span", { className: "skc-chip-count" }, counts.total),
              ),
              sourceOptions.map(([key, count]) =>
                h(
                  "button",
                  {
                    key,
                    className: "skc-chip",
                    "data-active": source === key ? "true" : "false",
                    onClick: () => setSource(key),
                  },
                  sourceLabel(key),
                  h("span", { className: "skc-chip-count" }, count),
                ),
              ),
            ),
            h(
              "div",
              { className: "skc-toolbar-tools" },
              h(
                "label",
                { className: "skc-check" },
                h("input", {
                  type: "checkbox",
                  checked: onlyUnclassified,
                  onChange: (event) => setOnlyUnclassified(event.target.checked),
                }),
                tt("filter.onlyUnclassified"),
              ),
              h(
                "button",
                { className: "skc-tool-link", onClick: expandAll },
                tt("action.expandAll"),
              ),
              h(
                "button",
                { className: "skc-tool-link", onClick: collapseAll },
                tt("action.collapseAll"),
              ),
              h(
                "button",
                {
                  className: "skc-tool-link",
                  onClick: handleReset,
                  disabled: busy,
                  title: "从 skill-hub 重新载入默认 7 类",
                },
                tt("action.reset"),
              ),
              busy
                ? h("span", { className: "skc-saving" }, "保存中…")
                : null,
            ),
          ),
          error
            ? h("div", { className: "skc-banner", "data-kind": "error" }, error)
            : null,
          data?.warning
            ? h("div", { className: "skc-banner" }, data.warning)
            : null,
          loading && data === null
            ? h(
                "div",
                { className: "skc-loading" },
                h("span", { className: "skc-spinner" }),
                tt("loading"),
              )
            : h(
                "div",
                { className: "skc-list" },
                sections.length === 0
                  ? h("div", { className: "skc-empty" }, tt("empty.search"))
                  : sections.map((item) => {
                      const isOpen = !collapsed.has(item.key);
                      const isDropTarget = dragOver === item.key;
                      return h(
                        "section",
                        {
                          key: item.key,
                          className: "skc-section",
                          "data-drop": isDropTarget ? "true" : "false",
                          onDragOver: (event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setDragOver(item.key);
                          },
                          onDragLeave: (event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) {
                              setDragOver((current) =>
                                current === item.key ? null : current,
                              );
                            }
                          },
                          onDrop: (event) => handleDrop(event, item.key),
                        },
                        h(
                          "div",
                          {
                            className: "skc-section-head",
                            onClick: () => toggleCollapsed(item.key),
                          },
                          h(
                            "span",
                            {
                              className: "skc-caret",
                              "data-open": isOpen ? "true" : "false",
                            },
                            "▶",
                          ),
                          h("span", { className: "skc-cat-icon" }, item.icon),
                          h(
                            "div",
                            { className: "skc-cat-copy" },
                            h("span", { className: "skc-cat-label" }, item.label),
                            h("span", { className: "skc-cat-key" }, item.key),
                          ),
                          h(
                            "span",
                            { className: "skc-cat-count" },
                            query.trim() !== "" || source !== "all" || onlyUnclassified
                              ? `${item.skills.length} / ${item.allCount}`
                              : item.allCount,
                          ),
                          item.unclassified
                            ? null
                            : h(
                                "div",
                                { className: "skc-cat-actions" },
                                h(
                                  "button",
                                  {
                                    className: "skc-icon-btn",
                                    title: "重命名分类",
                                    onClick: (event) => {
                                      event.stopPropagation();
                                      setDialog({ type: "rename", item });
                                    },
                                  },
                                  "✎",
                                ),
                                h(
                                  "button",
                                  {
                                    className: "skc-icon-btn",
                                    "data-danger": "true",
                                    title: "删除分类",
                                    onClick: (event) => {
                                      event.stopPropagation();
                                      setDialog({ type: "delete", item });
                                    },
                                  },
                                  "×",
                                ),
                              ),
                        ),
                        isOpen
                          ? h(
                              "div",
                              { className: "skc-section-body" },
                              item.skills.length === 0
                                ? h(
                                    "div",
                                    { className: "skc-drop-hint" },
                                    item.unclassified
                                      ? "所有技能都已归类"
                                      : tt("section.dropHint"),
                                  )
                                : item.skills.map((skill) =>
                                    h(SkillRow, {
                                      key: skill.name,
                                      skill,
                                      classes,
                                      onMove: moveSkill,
                                      onDragStart: setDragging,
                                      onDragEnd: () => setDragging(null),
                                      saving: busy,
                                    }),
                                  ),
                            )
                          : null,
                      );
                    }),
              ),
          h(
            "footer",
            { className: "skc-footer" },
            h(
              "span",
              null,
              `${tt("footer.storage")}：`,
              h("code", { title: data?.storage?.categories }, storageSource),
            ),
            h(
              "span",
              null,
              `${tt("footer.hub")}：`,
              h(
                "code",
                { title: data?.storage?.hub },
                data?.storage?.hub ?? "—",
              ),
            ),
            h(
              "span",
              null,
              h("span", { className: "skc-footer-dot" }),
              tt("footer.synced"),
            ),
            data?.generatedAt
              ? h(
                  "span",
                  null,
                  `更新于 ${new Date(data.generatedAt).toLocaleTimeString()}`,
                )
              : null,
          ),
        ),
        dialog?.type === "create"
          ? h(CategoryDialog, {
              mode: "create",
              busy,
              onCancel: () => setDialog(null),
              onSubmit: handleCreate,
            })
          : null,
        dialog?.type === "rename"
          ? h(CategoryDialog, {
              mode: "rename",
              initial: dialog.item,
              busy,
              onCancel: () => setDialog(null),
              onSubmit: handleRename,
            })
          : null,
        dialog?.type === "delete"
          ? h(DeleteDialog, {
              item: dialog.item,
              count:
                categoryCounts.get(dialog.item.key) ??
                dialog.item.skills?.length ??
                0,
              busy,
              onCancel: () => setDialog(null),
              onConfirm: handleDelete,
            })
          : null,
        h(Toast, { toast }),
      );
    }

    const inject = ["slots", "locale", "layout"];

    function apply(ctx) {
      ensureCss();
      ctx.effect(() => {
        try {
          return ctx.locale.register(NS, { zh: DICTIONARY.zh, en: DICTIONARY.en });
        } catch {
          return () => {};
        }
      }, "skill-categories: dictionaries");
      try {
        setRuntimeTranslate(ctx.locale.bind(NS));
      } catch {
        setRuntimeTranslate(undefined);
      }
      ctx.slots.inject("sidebar.panellist", () =>
        ctx.slots.register(
          {
            name: "sidebar.panellist",
            id: PANEL_ID,
            order: 31,
            label: () => tt("entry.label"),
          },
          SidebarIcon,
        ),
      );
      ctx.slots.inject("main", () =>
        ctx.slots.register(
          { name: "main", key: PANEL_ID },
          PanelPage,
        ),
      );
    }

    return { name: "skill-categories", inject, apply };
  },
});
