(function () {
  "use strict";

  const questions = window.DEQ_QUESTIONS || [];
  const options = window.DEQ_RESPONSE_OPTIONS || [];
  const config = window.DEQ_CONFIG || {};
  const answers = Array(questions.length).fill(null);
  let currentQuestion = 0;
  let saveState = "not-started";
  let eligibilityConfirmed = false;
  let savingConsent = false;
  let submission = null;
  let deleting = false;
  let screenBeforeAbout = "welcome-screen";

  const $ = (selector) => document.querySelector(selector);
  const screens = [...document.querySelectorAll(".screen")];

  function showScreen(id) {
    screens.forEach((screen) => {
      const active = screen.id === id;
      screen.hidden = !active;
      screen.classList.toggle("is-active", active);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function openPrivacy() {
    $("#session-choice").hidden = !eligibilityConfirmed || Boolean(submission);
    $("#withdraw-consent").hidden = !savingConsent;
    const dialog = $("#privacy-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
  }

  function handleAboutNavigation() {
    if (window.location.hash === "#about") {
      const active = screens.find((screen) => !screen.hidden);
      if (active && active.id !== "about-screen") screenBeforeAbout = active.id;
      showScreen("about-screen");
      $("#about-link").setAttribute("aria-current", "page");
      document.title = "The Human · Hyungil (Hugh) | DumEQ";
      $("#about-title").focus({ preventScroll: true });
    } else if (!$("#about-screen").hidden) {
      showScreen(screenBeforeAbout);
      $("#about-link").removeAttribute("aria-current");
      document.title = "Dummies Experience Questionnaire";
      $("#about-link").focus({ preventScroll: true });
    }
  }

  function beginFlow() {
    eligibilityConfirmed = true;
    savingConsent = true;
    $("#withdraw-status").textContent = "";
    updateSavingChoice();
    showScreen("intro-screen");
    $("#intro-title").focus({ preventScroll: true });
  }

  function returnToStart() {
    showScreen("welcome-screen");
    $("#start-area").scrollIntoView({ block: "center" });
    $("#start-button").focus({ preventScroll: true });
  }

  function renderQuestion() {
    const question = questions[currentQuestion];
    $("#domain-label").textContent = `${question.short} · ${question.domain}`;
    $("#progress-label").textContent = `Question ${currentQuestion + 1} of ${questions.length}`;
    $("#progress-fill").style.width = `${((currentQuestion + 1) / questions.length) * 100}%`;
    $("#question-number").textContent = String(currentQuestion + 1).padStart(2, "0");
    $("#question-text").textContent = question.text;
    $("#question-back").textContent = currentQuestion === 0 ? "Instructions" : "Back";
    $("#question-next").textContent = currentQuestion === questions.length - 1
      ? (savingConsent && !submission ? "Save & see results" : "See results") : "Next";

    const responseContainer = $("#response-options");
    responseContainer.replaceChildren();
    options.forEach((option) => {
      const label = document.createElement("label");
      label.className = "response-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "response";
      input.value = String(option.value);
      input.checked = answers[currentQuestion] === option.value;
      const number = document.createElement("span");
      number.className = "response-number";
      number.textContent = String(option.value);
      const text = document.createElement("span");
      text.className = "response-text";
      text.textContent = option.label;
      label.append(input, number, text);
      responseContainer.append(label);
    });

    const answered = answers[currentQuestion] !== null;
    $("#question-next").disabled = !answered;
    $("#answer-prompt").textContent = answered ? options[answers[currentQuestion]].label : "Choose one response to continue.";
    $("#question-text").focus({ preventScroll: true });
  }

  function handleResponse(event) {
    if (!event.target.matches('input[name="response"]')) return;
    answers[currentQuestion] = Number(event.target.value);
    $("#question-next").disabled = false;
    $("#answer-prompt").textContent = options[answers[currentQuestion]].label;
  }

  function getDomainScores() {
    const domains = new Map();
    questions.forEach((question, index) => {
      if (!domains.has(question.domain)) domains.set(question.domain, { short: question.short, score: 0, max: 0 });
      const domain = domains.get(question.domain);
      domain.score += answers[index];
      domain.max += 5;
    });
    return domains;
  }

  function renderResults() {
    if (answers.some((answer) => answer === null)) return;
    const total = answers.reduce((sum, answer) => sum + answer, 0);
    const maximum = questions.length * 5;
    const percentage = Math.round((total / maximum) * 100);
    $("#total-score").textContent = String(total);
    $("#score-percent").textContent = `${percentage}%`;
    $("#score-ring").style.setProperty("--score", `${percentage * 3.6}deg`);
    $("#score-ring").setAttribute("aria-label", `${percentage} per cent of the unofficial maximum`);

    const domainResults = $("#domain-results");
    domainResults.replaceChildren();
    getDomainScores().forEach((domain, name) => {
      const card = document.createElement("article");
      card.className = "domain-result";
      const heading = document.createElement("div");
      heading.className = "domain-result-heading";
      const title = document.createElement("h3");
      title.textContent = name;
      const score = document.createElement("span");
      score.textContent = `${domain.score}/${domain.max}`;
      const bar = document.createElement("div");
      bar.className = "domain-bar";
      const fill = document.createElement("span");
      fill.style.width = `${(domain.score / domain.max) * 100}%`;
      heading.append(title, score);
      bar.append(fill);
      card.append(heading, bar);
      domainResults.append(card);
    });

    const answerList = $("#answer-list");
    answerList.replaceChildren();
    questions.forEach((question, index) => {
      const item = document.createElement("li");
      const statement = document.createElement("span");
      statement.textContent = question.text;
      const answer = document.createElement("strong");
      answer.textContent = `${answers[index]} · ${options[answers[index]].label}`;
      item.append(statement, answer);
      answerList.append(item);
    });

    showScreen("result-screen");
    renderStorageStatus();
  }

  function databaseConfigured() {
    return Boolean(config.supabaseUrl && config.supabasePublishableKey);
  }

  function updateSavingChoice() {
    const optedIn = savingConsent;
    $("#intro-continue").disabled = !eligibilityConfirmed;

    $("#saving-label").textContent = optedIn ? "Saving enabled at the final step." : "Answers stay on this page.";
    $("#change-consent").hidden = Boolean(submission);
    $("#withdraw-consent").hidden = !savingConsent || Boolean(submission);
  }

  function renderStorageStatus() {
    const messages = {
      "not-started": ["Your result stays with you.", "Your answers have not been sent or saved. They disappear when you close or reload this page."],
      saving: ["Saving your response…", "Sending the 19 answers you agreed to save. Please keep this page open."],
      saved: ["Your response is saved.", "Your 19 answers were stored together, with your consent record. Keep the deletion code below. The response expires after 12 months."],
      uncertain: ["We could not confirm saving.", "The response may have reached the database. You can retry safely without creating a duplicate, or use the code below to delete it. There is no automatic retry."],
      deleted: ["Your saved response has been deleted.", "The matching answers have been removed from the live database. This result remains only on this page."]
    };
    const [title, message] = messages[saveState];
    $("#storage-title").textContent = title;
    $("#submission-status").textContent = message;
    $("#submit-answers").hidden = saveState !== "uncertain";
    $("#submit-answers").disabled = deleting;
    $("#deletion-receipt").hidden = !submission || saveState === "deleted";
    $("#receipt-code").value = submission ? submission.deletion_code : "";
    $("#delete-current").disabled = saveState === "saving" || deleting;
    $("#edit-answers").disabled = Boolean(submission) && saveState !== "deleted";
    $("#start-over").disabled = saveState === "saving" || deleting;

    updateSavingChoice();
  }

  async function callDatabase(name, payload) {
    if (!databaseConfigured()) throw new Error("Storage unavailable");
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
        method: "POST",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "apikey": config.supabasePublishableKey,
          "Accept-Profile": "public",
          "Content-Profile": "public"
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      return await response.json();
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function submitContribution() {
    if (!["not-started", "uncertain"].includes(saveState) || deleting || !savingConsent
        || !eligibilityConfirmed || answers.some((answer) => answer === null)) return;
    if (!submission) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      submission = {
        answer_values: [...answers],
        questionnaire_version: config.questionnaireVersion,
        consent_version: config.consentVersion,
        explicit_consent: true,
        deletion_code: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
      };
    }
    saveState = "saving";
    renderStorageStatus();
    try {
      const result = await callDatabase("submit_dumeq_response", submission);
      if (result !== "saved") throw new Error("Unexpected storage response");
      saveState = "saved";
    } catch {
      saveState = "uncertain";
    }
    renderStorageStatus();
  }

  async function deleteResponse() {
    if (deleting || saveState === "saving") return;
    const code = $("#deletion-code").value.trim().toLowerCase();
    const status = $("#delete-status");
    if (!/^[a-f0-9]{64}$/.test(code)) {
      status.textContent = "Enter the full 64-character deletion code.";
      return;
    }
    deleting = true;
    $("#delete-response").disabled = true;
    renderStorageStatus();
    status.textContent = "Deleting the matching response…";
    try {
      const result = await callDatabase("delete_dumeq_response", { deletion_code: code });
      if (result !== "deleted") throw new Error("Unexpected deletion response");
      status.textContent = "Deletion complete. No saved answers remain for this code. Provider backups and logs expire separately.";
      if (submission && code === submission.deletion_code) {
        saveState = "deleted";
        savingConsent = false;
      }
      $("#deletion-code").value = "";
    } catch {
      status.textContent = "Deletion could not be confirmed. Keep your code and try again, or contact h.suh@exeter.ac.uk.";
    } finally {
      deleting = false;
      $("#delete-response").disabled = false;
      renderStorageStatus();
    }
  }

  function downloadReceipt() {
    if (!submission) return;
    const content = `DumEQ deletion code\n\n${submission.deletion_code}\n\nKeep this code private. Visit https://hisuh17.github.io/deq/ and open Privacy & data to delete this response.\n\nConsent: ${submission.consent_version}\nQuestionnaire: ${submission.questionnaire_version}\nThe code alone is not confirmation that saving succeeded.\n`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "dumeq-deletion-code.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderAllQuestions() {
    const container = $("#all-questions-list");
    container.replaceChildren();
    let currentDomain = "";
    let list;
    questions.forEach((question, index) => {
      if (question.domain !== currentDomain) {
        currentDomain = question.domain;
        const heading = document.createElement("h3");
        heading.textContent = `${question.short} · ${question.domain}`;
        list = document.createElement("ol");
        list.start = index + 1;
        container.append(heading, list);
      }
      const item = document.createElement("li");
      item.textContent = question.text;
      list.append(item);
    });
  }

  async function shareSite() {
    const shareData = {
      title: "Dummies Experience Questionnaire",
      text: "A very serious questionnaire about things that did not go to plan. An unofficial parody.",
      url: window.location.href.split("#")[0]
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        showToast("Questionnaire link copied. Your answers were not included.");
      }
    } catch (error) {
      if (error.name !== "AbortError") showToast("Could not share the link.");
    }
  }

  function resetAssessment() {
    if (saveState === "saving" || deleting) return;
    answers.fill(null);
    currentQuestion = 0;
    saveState = "not-started";
    submission = null;
    eligibilityConfirmed = false;
    $("#intro-continue").disabled = true;
    savingConsent = false;

    $("#delete-status").textContent = "";
    $("#withdraw-status").textContent = "";
    $("#deletion-code").value = "";
    renderStorageStatus();
    showScreen("welcome-screen");
  }

  function initialise() {
    if (questions.length !== 19 || options.length !== 6) {
      document.body.textContent = "The questionnaire could not be loaded.";
      return;
    }

    renderAllQuestions();
    window.addEventListener("hashchange", handleAboutNavigation);
    handleAboutNavigation();
    ["#privacy-open-top", "#privacy-open-intro", "#privacy-open-result", "#privacy-open-footer"].forEach((selector) => {
      $(selector).addEventListener("click", openPrivacy);
    });
    $("#start-button").addEventListener("click", beginFlow);
    $("#read-questions-button").addEventListener("click", () => showScreen("all-questions-screen"));
    $("#questions-home").addEventListener("click", () => showScreen("welcome-screen"));
    $("#questions-start").addEventListener("click", returnToStart);
    $("#intro-back").addEventListener("click", () => showScreen("welcome-screen"));

    $("#intro-continue").addEventListener("click", () => {
      if (!eligibilityConfirmed) return;
      showScreen("quiz-screen");
      renderQuestion();
    });
    $("#response-options").addEventListener("change", handleResponse);
    $("#question-back").addEventListener("click", () => {
      if (currentQuestion === 0) return showScreen("intro-screen");
      currentQuestion -= 1;
      renderQuestion();
    });
    $("#question-next").addEventListener("click", () => {
      if (answers[currentQuestion] === null) return;
      if (currentQuestion === questions.length - 1) {
        renderResults();
        if (savingConsent && !submission) void submitContribution();
        return;
      }
      currentQuestion += 1;
      renderQuestion();
    });
    $("#edit-answers").addEventListener("click", () => {
      if (submission && saveState !== "deleted") return;
      currentQuestion = 0;
      showScreen("quiz-screen");
      renderQuestion();
    });

    $("#change-consent").addEventListener("click", openPrivacy);
    $("#withdraw-consent").addEventListener("click", () => {
      if (submission) return;
      savingConsent = false;
      updateSavingChoice();
      $("#withdraw-status").textContent = "Saving consent withdrawn. You can finish and see your result without saving.";
      if (!$("#quiz-screen").hidden) renderQuestion();
    });
    $("#submit-answers").addEventListener("click", submitContribution);
    $("#delete-response").addEventListener("click", deleteResponse);
    $("#delete-current").addEventListener("click", () => {
      if (!submission || saveState === "saving") return;
      $("#deletion-code").value = submission.deletion_code;
      openPrivacy();
      $("#deletion-code").scrollIntoView({ block: "center" });
      $("#delete-response").focus({ preventScroll: true });
    });
    $("#copy-receipt").addEventListener("click", async () => {
      if (!submission) return;
      try {
        await navigator.clipboard.writeText(submission.deletion_code);
        showToast("Deletion code copied. Keep it somewhere private.");
      } catch {
        $("#receipt-code").select();
        showToast("Select and copy the code, or use Download code.");
      }
    });
    $("#download-receipt").addEventListener("click", downloadReceipt);
    $("#share-site").addEventListener("click", shareSite);
    $("#start-over").addEventListener("click", resetAssessment);

    document.addEventListener("keydown", (event) => {
      if ($("#quiz-screen").hidden || $("#privacy-dialog").open || event.altKey || event.ctrlKey || event.metaKey) return;
      const value = Number(event.key);
      if (/^[0-5]$/.test(event.key) && Number.isInteger(value)) {
        const input = $(`#response-options input[value="${value}"]`);
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  initialise();
})();
