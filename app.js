(() => {
  "use strict";

  // =========================================================
  // STATE
  // =========================================================

  const state = {
    messages: [],
    files: 0,
    dialogs: new Map(),
    senders: new Set(),
    currentResults: [],
    cancelled: false,
    lastQuery: "",

    // Если вложения когда-либо будут лежать локально,
    // мы тоже сможем их использовать.
    fileIndex: new Map(),
    objectUrls: new Map(),
  };

  // =========================================================
  // DOM
  // =========================================================

  const $ = (id) => document.getElementById(id);

  const folderInput = $("folderInput");
  const chooseFolderBtn = $("chooseFolderBtn");
  const welcomeChooseBtn = $("welcomeChooseBtn");

  const welcomePanel = $("welcomePanel");
  const workspace = $("workspace");

  const loadingPanel = $("loadingPanel");
  const loadingText = $("loadingText");
  const progressBar = $("progressBar");
  const cancelBtn = $("cancelBtn");

  const searchInput = $("searchInput");
  const searchBtn = $("searchBtn");
  const clearSearchBtn = $("clearSearchBtn");

  const dialogFilter = $("dialogFilter");
  const senderFilter = $("senderFilter");

  const caseSensitive = $("caseSensitive");
  const wholeWord = $("wholeWord");

  const dateFrom = $("dateFrom");
  const dateTo = $("dateTo");

  const contextCount = $("contextCount");

  const resultsEmpty = $("resultsEmpty");
  const resultsList = $("resultsList");

  const searchStatus = $("searchStatus");
  const resultCount = $("resultCount");

  const statDialogs = $("statDialogs");
  const statMessages = $("statMessages");
  const statFiles = $("statFiles");
  const statIndex = $("statIndex");

  const archivePathLabel = $("archivePathLabel");

  const modal = $("modal");
  const modalBackdrop = $("modalBackdrop");
  const closeModalBtn = $("closeModalBtn");

  const modalTitle = $("modalTitle");
  const modalMeta = $("modalMeta");
  const modalBody = $("modalBody");

  // =========================================================
  // HELPERS
  // =========================================================

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeText(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("ru-RU").format(value);
  }

  function yieldToBrowser() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  // =========================================================
  // FILE PATHS
  // =========================================================

  function extractRootPrefix(files) {
    const first = files[0]?.webkitRelativePath || "";
    const parts = first.split("/");
    return parts.length > 1 ? parts[0] : "";
  }

  function getMessagesRelativePath(file) {
    return (file.webkitRelativePath || file.name)
      .replaceAll("\\", "/");
  }

  function isMessageHtml(file) {
    const path = getMessagesRelativePath(file).toLowerCase();

    return (
      /\.html?$/.test(path) &&
      /(^|\/)messages\d+\.html?$/i.test(path)
    );
  }

  function parseDialogId(file) {
    const path = getMessagesRelativePath(file).split("/");
    const filenameIndex = path.length - 1;

    for (let i = filenameIndex - 1; i >= 0; i--) {
      if (/^\d+$/.test(path[i])) {
        return path[i];
      }
    }

    return "unknown";
  }

  // =========================================================
  // DIALOG
  // =========================================================

  function parseHtmlHeader(doc) {
    const crumbs = [
      ...doc.querySelectorAll(
        ".page_block_header_inner .ui_crumb"
      ),
    ];

    let dialogName = "";

    // Имя диалога у VK находится в последнем .ui_crumb
    // без ссылки.
    for (let i = crumbs.length - 1; i >= 0; i--) {
      const crumb = crumbs[i];

      if (!crumb.querySelector("a")) {
        dialogName = normalizeText(
          crumb.textContent
        );

        if (dialogName) {
          break;
        }
      }
    }

    return dialogName || "Неизвестный диалог";
  }

  function parseMessageHeader(headerEl) {
    const raw = normalizeText(
      headerEl?.textContent || ""
    );

    let sender = "Неизвестно";
    let dateText = "";
    let timeText = "";

    const match = raw.match(
      /^(.*?),\s+(.+?)\s+в\s+(.+)$/
    );

    if (match) {
      sender = normalizeText(match[1]);
      dateText = normalizeText(match[2]);
      timeText = normalizeText(match[3]);
    } else {
      const comma = raw.indexOf(",");

      if (comma > -1) {
        sender = raw.slice(0, comma).trim();
        dateText = raw.slice(comma + 1).trim();
      } else {
        sender = raw;
      }
    }

    return {
      sender,
      dateText,
      timeText,
      raw,
    };
  }

  // =========================================================
  // DATES
  // =========================================================

  function parseRussianDateTime(dateText, timeText) {
    const m = String(dateText).match(
      /(\d{1,2})\s+([а-яёА-ЯЁ]+)\s+(\d{4})/
    );

    if (!m) {
      return null;
    }

    const months = {
      январь: 0,
      января: 0,
      янв: 0,

      февраль: 1,
      февраля: 1,
      фев: 1,

      март: 2,
      марта: 2,
      мар: 2,

      апрель: 3,
      апреля: 3,
      апр: 3,

      май: 4,
      мая: 4,

      июнь: 5,
      июня: 5,
      июн: 5,

      июль: 6,
      июля: 6,
      июл: 6,

      август: 7,
      августа: 7,
      авг: 7,

      сентябрь: 8,
      сентября: 8,
      сен: 8,
      сент: 8,

      октябрь: 9,
      октября: 9,
      окт: 9,

      ноябрь: 10,
      ноября: 10,
      ноя: 10,

      декабрь: 11,
      декабря: 11,
      дек: 11,
    };

    const month =
      months[m[2].toLowerCase()];

    if (month == null) {
      return null;
    }

    const day = Number(m[1]);
    const year = Number(m[3]);

    const tm = String(timeText).match(
      /(\d{1,2}):(\d{2})(?::(\d{2}))?/
    );

    const hour = tm ? Number(tm[1]) : 0;
    const minute = tm ? Number(tm[2]) : 0;
    const second =
      tm && tm[3] ? Number(tm[3]) : 0;

    return new Date(
      year,
      month,
      day,
      hour,
      minute,
      second
    );
  }

  function dateOnlyISO(date) {
    if (
      !date ||
      Number.isNaN(date.getTime())
    ) {
      return "";
    }

    const y = date.getFullYear();
    const m = String(
      date.getMonth() + 1
    ).padStart(2, "0");

    const d = String(
      date.getDate()
    ).padStart(2, "0");

    return `${y}-${m}-${d}`;
  }

  function formatMessageDate(message) {
    if (
      !message.dateObj ||
      Number.isNaN(
        message.dateObj.getTime()
      )
    ) {
      return message.headerRaw;
    }

    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }
    ).format(message.dateObj);
  }

  // =========================================================
  // READ HTML
  // =========================================================

  function decodeHtmlBytes(buffer) {
    try {
      const decoder = new TextDecoder(
        "windows-1251",
        {
          fatal: false,
        }
      );

      return decoder.decode(buffer);
    } catch {
      return new TextDecoder(
        "utf-8",
        {
          fatal: false,
        }
      ).decode(buffer);
    }
  }

  async function readFileAsText(file) {
    const buffer =
      await file.arrayBuffer();

    return decodeHtmlBytes(buffer);
  }

  // =========================================================
  // MESSAGE TEXT
  // =========================================================

  function extractBodyText(messageEl) {
    /*
     * ЭТО СЕЛЕКТОР ИЗ ТВОЕЙ ПЕРВОЙ РАБОЧЕЙ ВЕРСИИ.
     *
     * .message
     *   ├── .message__header
     *   └── div   <-- тело сообщения
     */

    const bodyEl =
      messageEl.querySelector(
        ":scope > div:last-child"
      );

    if (!bodyEl) {
      return "";
    }

    const clone =
      bodyEl.cloneNode(true);

    // Убираем attachments и служебные данные,
    // чтобы ссылки на фото/голосовые не попадали
    // в текстовый поиск.
    clone
      .querySelectorAll(
        ".kludges, .attachment"
      )
      .forEach(
        (el) => el.remove()
      );

    return normalizeText(
      clone.textContent
    );
  }

  function getFileLabel(file) {
    return getMessagesRelativePath(file);
  }

  // =========================================================
  // ATTACHMENT FILE INDEX
  // =========================================================

  function normalizeArchivePath(path) {
    if (!path) {
      return "";
    }

    let value =
      String(path)
        .replaceAll("\\", "/");

    try {
      value = decodeURIComponent(value);
    } catch {
      // оставляем как есть
    }

    const parts = [];

    for (
      const part
      of value.split("/")
    ) {
      if (
        !part ||
        part === "."
      ) {
        continue;
      }

      if (part === "..") {
        parts.pop();
        continue;
      }

      parts.push(part);
    }

    return parts
      .join("/")
      .toLowerCase();
  }

  function buildFileIndex(fileList) {
    state.fileIndex.clear();

    for (const file of fileList) {
      const fullPath =
        normalizeArchivePath(
          getMessagesRelativePath(file)
        );

      if (!fullPath) {
        continue;
      }

      state.fileIndex.set(
        fullPath,
        file
      );

      const parts =
        fullPath.split("/");

      if (parts.length > 1) {
        const withoutRoot =
          parts
            .slice(1)
            .join("/");

        if (
          !state.fileIndex.has(
            withoutRoot
          )
        ) {
          state.fileIndex.set(
            withoutRoot,
            file
          );
        }
      }

      if (
        !state.fileIndex.has(
          file.name.toLowerCase()
        )
      ) {
        state.fileIndex.set(
          file.name.toLowerCase(),
          file
        );
      }
    }
  }

  function resolveLocalAttachment(
    sourceFilePath,
    href
  ) {
    if (!href) {
      return null;
    }

    const raw =
      String(href).trim();

    /*
     * Такие ссылки — внешние,
     * локального файла у нас нет.
     */
    if (
      /^https?:\/\//i.test(raw) ||
      raw.startsWith("//") ||
      raw.startsWith("data:") ||
      raw.startsWith("blob:")
    ) {
      return null;
    }

    const cleanHref =
      raw
        .split("#")[0]
        .split("?")[0];

    const sourceParts =
      normalizeArchivePath(
        sourceFilePath
      ).split("/");

    sourceParts.pop();

    const resolved =
      normalizeArchivePath(
        [
          ...sourceParts,
          cleanHref,
        ].join("/")
      );

    if (
      state.fileIndex.has(
        resolved
      )
    ) {
      return state.fileIndex.get(
        resolved
      );
    }

    const normalizedHref =
      normalizeArchivePath(
        cleanHref
      );

    if (
      state.fileIndex.has(
        normalizedHref
      )
    ) {
      return state.fileIndex.get(
        normalizedHref
      );
    }

    return null;
  }

  function getObjectUrl(file) {
    if (!file) {
      return null;
    }

    if (
      state.objectUrls.has(file)
    ) {
      return state.objectUrls.get(
        file
      );
    }

    try {
      const url =
        URL.createObjectURL(file);

      state.objectUrls.set(
        file,
        url
      );

      return url;
    } catch {
      return null;
    }
  }

  // =========================================================
  // ATTACHMENT TYPE
  // =========================================================

  function getAttachmentKind(
    href,
    description,
    file
  ) {
    const path =
      String(
        href ||
        file?.name ||
        ""
      ).toLowerCase();

    const mime =
      String(
        file?.type ||
        ""
      ).toLowerCase();

    const desc =
      String(
        description ||
        ""
      ).toLowerCase();

    // PHOTO
    if (
      mime.startsWith("image/") ||
      /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)(?:$|[?#])/i.test(
        path
      ) ||
      /фотограф/.test(desc)
    ) {
      return "image";
    }

    // AUDIO / VOICE
    if (
      mime.startsWith("audio/") ||
      /\.(mp3|ogg|oga|wav|m4a|aac|opus|flac|amr)(?:$|[?#])/i.test(
        path
      )
    ) {
      return "audio";
    }

    // VIDEO
    if (
      mime.startsWith("video/") ||
      /\.(mp4|webm|mov|avi|mkv|m4v)(?:$|[?#])/i.test(
        path
      ) ||
      /видеозапис/.test(desc)
    ) {
      return "video";
    }

    return "file";
  }

  // =========================================================
  // EXTRACT ATTACHMENTS
  // =========================================================

  function extractAttachments(
    messageEl,
    sourceFilePath
  ) {
    const attachments = [];

    const attachmentElements = [
      ...messageEl.querySelectorAll(
        ".attachment"
      ),
    ];

    for (
      const attachmentEl
      of attachmentElements
    ) {
      const description =
        normalizeText(
          attachmentEl.querySelector(
            ".attachment__description"
          )?.textContent || ""
        );

      /*
       * В твоём архиве основной URL:
       *
       * <a class="attachment__link"
       *    href="https://...jpg">
       *
       * или:
       *
       * <a class="attachment__link"
       *    href="https://...ogg">
       */

      const link =
        attachmentEl.querySelector(
          "a.attachment__link[href]"
        ) ||
        attachmentEl.querySelector(
          "a[href]"
        );

      if (!link) {
        /*
         * Стикеры, "Сообщение удалено",
         * "1 прикреплённое сообщение" и т.п.
         * без ссылки пока пропускаем.
         */
        continue;
      }

      const href =
        String(
          link.getAttribute(
            "href"
          ) || ""
        ).trim();

      if (!href) {
        continue;
      }

      const localFile =
        resolveLocalAttachment(
          sourceFilePath,
          href
        );

      const kind =
        getAttachmentKind(
          href,
          description,
          localFile
        );

      attachments.push({
        kind,
        description,
        href,
        file: localFile,
        fileName:
          localFile?.name || "",
        external:
          /^https?:\/\//i.test(
            href
          ),
      });
    }

    return attachments;
  }

  // =========================================================
  // RENDER ATTACHMENTS
  // =========================================================

  function renderAttachments(
    attachments,
    compact = false
  ) {
    if (
      !attachments ||
      !attachments.length
    ) {
      return "";
    }

    return `
      <div class="attachments">

        ${attachments
          .map((attachment) => {
            const localUrl =
              attachment.file
                ? getObjectUrl(
                    attachment.file
                  )
                : null;

            /*
             * У тебя именно здесь будет
             *
             * https://sun9-...jpg
             * https://psv4...ogg
             */
            const externalUrl =
              !localUrl &&
              /^https?:\/\//i.test(
                attachment.href || ""
              )
                ? attachment.href
                : null;

            const mediaUrl =
              localUrl ||
              externalUrl;

            // -------------------------
            // PHOTO
            // -------------------------

            if (
              attachment.kind ===
                "image" &&
              mediaUrl
            ) {
              return `
                <div class="attachment-image-wrap">

                  <a
                    href="${escapeHtml(
                      mediaUrl
                    )}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="attachment-image-link"
                  >

                    <img
                      src="${escapeHtml(
                        mediaUrl
                      )}"
                      class="attachment-image ${
                        compact
                          ? "compact"
                          : ""
                      }"
                      alt="${escapeHtml(
                        attachment.description ||
                          "Фотография"
                      )}"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                    >

                  </a>

                </div>
              `;
            }

            // -------------------------
            // AUDIO
            // -------------------------

            if (
              attachment.kind ===
                "audio" &&
              mediaUrl
            ) {
              return `
                <div class="attachment-audio">

                  <div class="attachment-audio-icon">
                    🎙️
                  </div>

                  <div class="attachment-audio-content">

                    <div class="attachment-label">
                      ${escapeHtml(
                        attachment.description ||
                          "Голосовое сообщение"
                      )}
                    </div>

                    <audio
                      controls
                      preload="metadata"
                      src="${escapeHtml(
                        mediaUrl
                      )}"
                      referrerpolicy="no-referrer"
                    ></audio>

                  </div>

                </div>
              `;
            }

            // -------------------------
            // VIDEO
            // -------------------------

            if (
              attachment.kind ===
                "video" &&
              mediaUrl
            ) {
              return `
                <div class="attachment-video-wrap">

                  <video
                    class="attachment-video"
                    controls
                    preload="metadata"
                    src="${escapeHtml(
                      mediaUrl
                    )}"
                    referrerpolicy="no-referrer"
                  ></video>

                </div>
              `;
            }

            // -------------------------
            // OTHER FILE
            // -------------------------

            if (mediaUrl) {
              return `
                <a
                  class="attachment-file"
                  href="${escapeHtml(
                    mediaUrl
                  )}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  📎
                  ${escapeHtml(
                    attachment.description ||
                    attachment.fileName ||
                    "Открыть вложение"
                  )}
                </a>
              `;
            }

            return "";
          })
          .join("")}

      </div>
    `;
  }

  // =========================================================
  // INDEX
  // =========================================================

  async function buildIndex(
    fileList
  ) {
    state.messages = [];
    state.files = 0;
    state.dialogs = new Map();
    state.senders = new Set();
    state.cancelled = false;

    // Освобождаем старые blob URL.
    for (
      const url
      of state.objectUrls.values()
    ) {
      try {
        URL.revokeObjectURL(
          url
        );
      } catch {}
    }

    state.objectUrls.clear();

    // Все выбранные файлы.
    const allFiles =
      Array.from(fileList);

    // Индекс локальных вложений.
    buildFileIndex(
      allFiles
    );

    // Только страницы сообщений.
    const files =
      allFiles.filter(
        isMessageHtml
      );

    state.files =
      files.length;

    if (!files.length) {
      throw new Error(
        "Не найдено ни одного файла messages0.html/messages50.html/... " +
        "Проверьте, что выбрана папка messages или корень архива VK."
      );
    }

    const rootPrefix =
      extractRootPrefix(
        fileList
      );

    archivePathLabel.textContent =
      rootPrefix
        ? `Выбрано: ${rootPrefix}`
        : "Локальный архив";

    loadingPanel.classList.remove(
      "hidden"
    );

    welcomePanel.classList.add(
      "hidden"
    );

    statIndex.textContent =
      "Индексация…";

    loadingText.textContent =
      `Найдено HTML-файлов: ${formatNumber(
        files.length
      )}`;

    progressBar.style.width =
      "0%";

    // =======================================================
    // FILES
    // =======================================================

    for (
      let i = 0;
      i < files.length;
      i++
    ) {
      if (state.cancelled) {
        break;
      }

      const file =
        files[i];

      try {
        const html =
          await readFileAsText(
            file
          );

        const doc =
          new DOMParser()
            .parseFromString(
              html,
              "text/html"
            );

        const dialogId =
          parseDialogId(
            file
          );

        const dialogName =
          parseHtmlHeader(
            doc
          );

        const messages =
          [
            ...doc.querySelectorAll(
              ".message[data-id]"
            ),
          ];

        // =====================================================
        // MESSAGES
        // =====================================================

        let sequence = 0;

        for (
          const messageEl
          of messages
        ) {
          const id =
            messageEl.getAttribute(
              "data-id"
            ) ||
            `${i}-${sequence++}`;

          const headerEl =
            messageEl.querySelector(
              ".message__header"
            );

          const parsedHeader =
            parseMessageHeader(
              headerEl ||
              messageEl
            );

          // Текст — из первой рабочей версии.
          const text =
            extractBodyText(
              messageEl
            );

          // Новая часть — вложения.
          const attachments =
            extractAttachments(
              messageEl,
              getFileLabel(file)
            );

          if (
            !text &&
            !attachments.length &&
            !parsedHeader.raw
          ) {
            continue;
          }

          const dateObj =
            parseRussianDateTime(
              parsedHeader.dateText,
              parsedHeader.timeText
            );

          const message = {
            id,

            dialogId,
            dialogName,

            sender:
              parsedHeader.sender,

            dateText:
              parsedHeader.dateText,

            timeText:
              parsedHeader.timeText,

            headerRaw:
              parsedHeader.raw,

            text:
              text ||
              "",

            attachments,

            dateObj,

            dateISO:
              dateOnlyISO(
                dateObj
              ),

            fileName:
              file.name,

            filePath:
              getFileLabel(
                file
              ),

            file,
          };

          state.messages.push(
            message
          );

          state.senders.add(
            message.sender
          );

          if (
            !state.dialogs.has(
              dialogId
            )
          ) {
            state.dialogs.set(
              dialogId,
              {
                id: dialogId,
                name: dialogName,
                count: 0,
              }
            );
          }

          state.dialogs.get(
            dialogId
          ).count++;
        }
      } catch (error) {
        console.warn(
          "Ошибка обработки файла:",
          getFileLabel(file),
          error
        );
      }

      // =====================================================
      // PROGRESS
      // =====================================================

      if (
        i % 8 === 0 ||
        i === files.length - 1
      ) {
        const percent =
          Math.round(
            ((i + 1) /
              files.length) *
              100
          );

        progressBar.style.width =
          `${percent}%`;

        loadingText.textContent =
          `Файл ${formatNumber(
            i + 1
          )} из ${formatNumber(
            files.length
          )} • ${formatNumber(
            state.messages.length
          )} сообщений`;

        await yieldToBrowser();
      }
    }

    // =======================================================
    // CANCEL
    // =======================================================

    if (state.cancelled) {
      state.messages = [];
      state.dialogs.clear();
      state.senders.clear();

      statIndex.textContent =
        "Отменено";

      loadingPanel.classList.add(
        "hidden"
      );

      return;
    }

    // =======================================================
    // SORT
    // =======================================================

    state.messages.sort(
      (a, b) => {
        const ta =
          a.dateObj?.getTime() ?? 0;

        const tb =
          b.dateObj?.getTime() ?? 0;

        return ta - tb;
      }
    );

    populateFilters();
    updateStats();

    loadingPanel.classList.add(
      "hidden"
    );

    workspace.classList.remove(
      "hidden"
    );

    statIndex.textContent =
      "Готово";

    searchStatus.textContent =
      "Архив проиндексирован. Введите запрос.";

    showEmptyState(
      "Введите запрос",
      "Результаты появятся здесь. Нажмите на найденное сообщение, чтобы открыть контекст переписки."
    );
  }

  // =========================================================
  // FILTERS
  // =========================================================

  function populateFilters() {
    const dialogs =
      [
        ...state.dialogs.values()
      ].sort(
        (a, b) =>
          a.name.localeCompare(
            b.name,
            "ru"
          )
      );

    dialogFilter.innerHTML =
      `<option value="">Все диалоги</option>` +
      dialogs
        .map(
          (d) =>
            `<option value="${escapeHtml(
              d.id
            )}">${escapeHtml(
              d.name
            )} (${formatNumber(
              d.count
            )})</option>`
        )
        .join("");

    const senders =
      [
        ...state.senders
      ].sort(
        (a, b) =>
          a.localeCompare(
            b,
            "ru"
          )
      );

    senderFilter.innerHTML =
      `<option value="">Все отправители</option>` +
      senders
        .map(
          (s) =>
            `<option value="${escapeHtml(
              s
            )}">${escapeHtml(
              s
            )}</option>`
        )
        .join("");
  }

  function updateStats() {
    statDialogs.textContent =
      formatNumber(
        state.dialogs.size
      );

    statMessages.textContent =
      formatNumber(
        state.messages.length
      );

    statFiles.textContent =
      formatNumber(
        state.files
      );
  }

  // =========================================================
  // EMPTY STATE
  // =========================================================

  function showEmptyState(
    title,
    text
  ) {
    resultsEmpty.classList.remove(
      "hidden"
    );

    resultsList.classList.add(
      "hidden"
    );

    resultsEmpty.querySelector(
      "h2"
    ).textContent =
      title;

    resultsEmpty.querySelector(
      "p"
    ).textContent =
      text;
  }

  // =========================================================
  // SEARCH HIGHLIGHT
  // =========================================================

  function highlightText(
    text,
    query,
    useCaseSensitive,
    useWholeWord
  ) {
    if (!query) {
      return escapeHtml(
        text
      );
    }

    const source =
      useCaseSensitive
        ? query
        : query.toLocaleLowerCase(
            "ru-RU"
          );

    const flags =
      useCaseSensitive
        ? "g"
        : "giu";

    let pattern =
      escapeRegExp(
        source
      );

    if (useWholeWord) {
      pattern =
        `(?<![\\p{L}\\p{N}_])` +
        pattern +
        `(?![\\p{L}\\p{N}_])`;
    }

    try {
      const regex =
        new RegExp(
          pattern,
          flags
        );

      let result = "";
      let last = 0;

      for (
        const match
        of text.matchAll(
          regex
        )
      ) {
        result += escapeHtml(
          text.slice(
            last,
            match.index
          )
        );

        result +=
          `<mark>${escapeHtml(
            match[0]
          )}</mark>`;

        last =
          match.index +
          match[0].length;
      }

      result += escapeHtml(
        text.slice(
          last
        )
      );

      return result;
    } catch {
      return escapeHtml(
        text
      );
    }
  }

  // =========================================================
  // FILTER RESULTS
  // =========================================================

  function getFilteredResults(
    query
  ) {
    const normalizedQuery =
      caseSensitive.checked
        ? query.trim()
        : query
            .trim()
            .toLocaleLowerCase(
              "ru-RU"
            );

    const dialogId =
      dialogFilter.value;

    const sender =
      senderFilter.value;

    const from =
      dateFrom.value;

    const to =
      dateTo.value;

    let matcher = null;

    if (normalizedQuery) {
      let pattern =
        escapeRegExp(
          normalizedQuery
        );

      if (wholeWord.checked) {
        pattern =
          `(?<![\\p{L}\\p{N}_])` +
          pattern +
          `(?![\\p{L}\\p{N}_])`;
      }

      try {
        matcher =
          new RegExp(
            pattern,
            caseSensitive.checked
              ? "u"
              : "iu"
          );
      } catch {
        matcher = null;
      }
    }

    return state.messages.filter(
      (message) => {
        if (
          dialogId &&
          message.dialogId !==
            dialogId
        ) {
          return false;
        }

        if (
          sender &&
          message.sender !==
            sender
        ) {
          return false;
        }

        if (
          from &&
          (
            !message.dateISO ||
            message.dateISO <
              from
          )
        ) {
          return false;
        }

        if (
          to &&
          (
            !message.dateISO ||
            message.dateISO >
              to
          )
        ) {
          return false;
        }

        if (!normalizedQuery) {
          return false;
        }

        const haystack =
          caseSensitive.checked
            ? message.text
            : message.text.toLocaleLowerCase(
                "ru-RU"
              );

        return matcher
          ? matcher.test(
              message.text
            )
          : haystack.includes(
              normalizedQuery
            );
      }
    );
  }

  // =========================================================
  // RENDER RESULTS
  // =========================================================

  function renderResults(
    results,
    query
  ) {
    state.currentResults =
      results;

    resultCount.textContent =
      results.length
        ? `Найдено: ${formatNumber(
            results.length
          )}`
        : "";

    if (!results.length) {
      showEmptyState(
        "Ничего не найдено",
        "Попробуйте изменить запрос или снять один из фильтров."
      );

      searchStatus.textContent =
        "По запросу совпадений нет.";

      return;
    }

    resultsEmpty.classList.add(
      "hidden"
    );

    resultsList.classList.remove(
      "hidden"
    );

    const maxRender = 500;

    const visible =
      results.slice(
        0,
        maxRender
      );

    resultsList.innerHTML =
      visible
        .map(
          (m, index) => {
            const shortText =
              m.text.length > 1200
                ? `${m.text.slice(
                    0,
                    1200
                  )}…`
                : m.text;

            return `
              <article class="result-card">

                <div class="result-top">
                  <div>

                    <div class="result-dialog">
                      ${escapeHtml(
                        m.dialogName
                      )}
                    </div>

                    <div class="result-date">
                      ${escapeHtml(
                        formatMessageDate(
                          m
                        )
                      )}
                    </div>

                  </div>
                </div>

                <div class="result-sender">
                  ${escapeHtml(
                    m.sender
                  )}
                </div>

                ${
                  shortText
                    ? `
                      <div class="result-text">
                        ${highlightText(
                          shortText,
                          query,
                          caseSensitive.checked,
                          wholeWord.checked
                        )}
                      </div>
                    `
                    : ""
                }

                ${renderAttachments(
                  m.attachments,
                  true
                )}

                <div class="result-actions">

                  <button
                    class="link-button"
                    type="button"
                    data-result-index="${index}"
                  >
                    Открыть контекст
                  </button>

                </div>

              </article>
            `;
          }
        )
        .join("");

    if (
      results.length >
      maxRender
    ) {
      searchStatus.textContent =
        `Показаны первые ${formatNumber(
          maxRender
        )} из ${formatNumber(
          results.length
        )} результатов. ` +
        `Уточните запрос или фильтры.`;
    } else {
      searchStatus.textContent =
        "Нажмите «Открыть контекст», чтобы посмотреть соседние сообщения.";
    }
  }

  // =========================================================
  // SEARCH
  // =========================================================

  function doSearch() {
    const query =
      searchInput.value.trim();

    state.lastQuery =
      query;

    clearSearchBtn.classList.toggle(
      "hidden",
      !query
    );

    if (!query) {
      resultCount.textContent =
        "";

      searchStatus.textContent =
        "Введите запрос для поиска.";

      showEmptyState(
        "Введите запрос",
        "Результаты появятся здесь. Нажмите на найденное сообщение, чтобы открыть контекст переписки."
      );

      return;
    }

    const results =
      getFilteredResults(
        query
      );

    renderResults(
      results,
      query
    );
  }

  // =========================================================
  // CONTEXT
  // =========================================================

  function openContext(
    target
  ) {
    const context =
      Number(
        contextCount.value
      ) || 2;

    /*
     * Берём сообщения только
     * нужного диалога.
     */
    const sameDialog =
      state.messages.filter(
        (m) =>
          m.dialogId ===
          target.dialogId
      );

    const targetIndex =
      sameDialog.findIndex(
        (m) =>
          m.id ===
          target.id
      );

    if (
      targetIndex < 0
    ) {
      return;
    }

    const start =
      Math.max(
        0,
        targetIndex -
          context
      );

    const end =
      Math.min(
        sameDialog.length,
        targetIndex +
          context +
          1
      );

    const finalMessages =
      sameDialog.slice(
        start,
        end
      );

    modalTitle.textContent =
      target.dialogName;

    modalMeta.textContent =
      `${formatMessageDate(
        target
      )} • ${target.sender} • ${target.fileName}`;

    modalBody.innerHTML = `
      <div class="context-list">

        ${finalMessages
          .map(
            (m) => {
              const isTarget =
                m.id ===
                target.id;

              const mine =
                m.sender ===
                "Вы";

              return `
                <div
                  class="
                    context-message
                    ${mine ? "mine" : ""}
                    ${isTarget ? "target" : ""}
                  "
                >

                  <div class="bubble">

                    ${
                      isTarget
                        ? `
                          <div class="target-badge">
                            Найдено
                          </div>
                        `
                        : ""
                    }

                    <div class="message-head">

                      <span class="message-sender">
                        ${escapeHtml(
                          m.sender
                        )}
                      </span>

                      <span class="message-time">
                        ${escapeHtml(
                          formatMessageDate(
                            m
                          )
                        )}
                      </span>

                    </div>

                    ${
                      m.text
                        ? `
                          <div class="message-text">
                            ${escapeHtml(
                              m.text
                            )}
                          </div>
                        `
                        : ""
                    }

                    ${renderAttachments(
                      m.attachments,
                      false
                    )}

                  </div>

                </div>
              `;
            }
          )
          .join("")}

      </div>
    `;

    modal.classList.remove(
      "hidden"
    );

    modal.setAttribute(
      "aria-hidden",
      "false"
    );

    document.body.style.overflow =
      "hidden";

    requestAnimationFrame(
      () => {
        const targetEl =
          modalBody.querySelector(
            ".context-message.target"
          );

        if (targetEl) {
          targetEl.scrollIntoView({
            block: "center",
            behavior: "auto",
          });
        }
      }
    );
  }

  // =========================================================
  // CLOSE MODAL
  // =========================================================

  function closeModal() {
    modal.classList.add(
      "hidden"
    );

    modal.setAttribute(
      "aria-hidden",
      "true"
    );

    document.body.style.overflow =
      "";
  }

  // =========================================================
  // FOLDER
  // =========================================================

  async function handleFolderFiles(
    files
  ) {
    if (
      !files ||
      !files.length
    ) {
      return;
    }

    state.cancelled =
      false;

    workspace.classList.remove(
      "hidden"
    );

    await buildIndex(
      files
    );
  }

  // =========================================================
  // EVENTS
  // =========================================================

  chooseFolderBtn.addEventListener(
    "click",
    () => folderInput.click()
  );

  welcomeChooseBtn.addEventListener(
    "click",
    () => folderInput.click()
  );

  folderInput.addEventListener(
    "change",
    async (event) => {
      try {
        await handleFolderFiles(
          event.target.files
        );
      } catch (error) {
        console.error(
          error
        );

        loadingPanel.classList.add(
          "hidden"
        );

        alert(
          `Не удалось обработать архив:\n\n${error.message}`
        );

        welcomePanel.classList.remove(
          "hidden"
        );

        workspace.classList.add(
          "hidden"
        );
      } finally {
        folderInput.value =
          "";
      }
    }
  );

  // Cancel
  cancelBtn.addEventListener(
    "click",
    () => {
      state.cancelled =
        true;

      loadingText.textContent =
        "Отмена…";
    }
  );

  // Search
  searchBtn.addEventListener(
    "click",
    doSearch
  );

  searchInput.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key ===
        "Enter"
      ) {
        doSearch();
      }
    }
  );

  // Filters
  [
    dialogFilter,
    senderFilter,
    caseSensitive,
    wholeWord,
    dateFrom,
    dateTo,
  ].forEach(
    (el) => {
      el.addEventListener(
        "change",
        () => {
          if (
            searchInput.value.trim()
          ) {
            doSearch();
          }
        }
      );
    }
  );

  // Clear search
  clearSearchBtn.addEventListener(
    "click",
    () => {
      searchInput.value =
        "";

      clearSearchBtn.classList.add(
        "hidden"
      );

      resultCount.textContent =
        "";

      searchStatus.textContent =
        "Введите запрос для поиска.";

      showEmptyState(
        "Введите запрос",
        "Результаты появятся здесь. Нажмите на найденное сообщение, чтобы открыть контекст переписки."
      );

      searchInput.focus();
    }
  );

  // Result -> context
  resultsList.addEventListener(
    "click",
    (event) => {
      const button =
        event.target.closest(
          "[data-result-index]"
        );

      if (!button) {
        return;
      }

      const index =
        Number(
          button.dataset.resultIndex
        );

      const target =
        state.currentResults[
          index
        ];

      if (target) {
        openContext(
          target
        );
      }
    }
  );

  // Modal
  closeModalBtn.addEventListener(
    "click",
    closeModal
  );

  modalBackdrop.addEventListener(
    "click",
    closeModal
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key ===
          "Escape" &&
        !modal.classList.contains(
          "hidden"
        )
      ) {
        closeModal();
      }
    }
  );

  // =========================================================
  // INIT
  // =========================================================

  statIndex.textContent =
    "Ожидание";
})();