(function () {
  "use strict";

  const questions = window.DEQ_QUESTIONS || [];
  const options = window.DEQ_RESPONSE_OPTIONS || [];
  const config = window.DEQ_CONFIG || {};
  const answers = Array(questions.length).fill(null);
  let currentQuestion = 0;
  let submitted = false;

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
    const dialog = $("#privacy-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
  }

  function beginFlow() {
    showScreen("intro-screen");
    window.setTimeout(() => $("#eligibility").focus(), 50);
  }

  function renderQuestion() {
    const question = questions[currentQuestion];
    $("#domain-label").textContent = `${question.short} · ${question.domain}`;
    $("#progress-label").textContent = `Question ${currentQuestion + 1} of ${questions.length}`;
    $("#progress-fill").style.width = `${((currentQuestion + 1) / questions.length) * 100}%`;
    $("#question-number").textContent = String(currentQuestion + 1).padStart(2, "0");
    $("#question-text").textContent = question.text;
    $("#question-back").textContent = currentQuestion === 0 ? "Instructions" : "Back";
    $("#question-next").textContent = currentQuestion === questions.length - 1 ? "See results" : "Next";

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
  }

  function databaseConfigured() {
    return Boolean(config.supabaseUrl && config.supabasePublishableKey);
  }

  async function submitContribution() {
    if (submitted || !databaseConfigured() || answers.some((answer) => answer === null)) return;
    const button = $("#submit-answers");
    const status = $("#submission-status");
    button.disabled = true;
    status.textContent = "Adding your answers to the totals…";

    try {
      const endpoint = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/submit_deq_response`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": config.supabasePublishableKey,
          "Accept-Profile": "public",
          "Content-Profile": "public"
        },
        body: JSON.stringify({
          answer_values: answers,
          questionnaire_version: config.questionnaireVersion,
          consent_version: config.consentVersion
        })
      });
      if (!response.ok) throw new Error(`Submission failed with status ${response.status}`);
      submitted = true;
      $("#data-consent").disabled = true;
      button.textContent = "Contribution added";
      status.textContent = "Thank you. Your answers were added to the aggregate counts; no individual DumEQ response row was retained.";
    } catch (error) {
      console.error(error);
      button.disabled = !$("#data-consent").checked;
      status.textContent = "The contribution could not be added. Your result is still available here, and no retry will happen automatically.";
    }
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
    answers.fill(null);
    currentQuestion = 0;
    submitted = false;
    $("#eligibility").checked = false;
    $("#intro-continue").disabled = true;
    $("#data-consent").checked = false;
    $("#data-consent").disabled = false;
    $("#submit-answers").textContent = "Contribute to community totals";
    $("#submit-answers").disabled = true;
    $("#submission-status").textContent = "";
    showScreen("welcome-screen");
  }

  function initialise() {
    if (questions.length !== 19 || options.length !== 6) {
      document.body.textContent = "The questionnaire could not be loaded.";
      return;
    }

    renderAllQuestions();
    ["#privacy-open-top", "#privacy-open-result", "#privacy-open-footer"].forEach((selector) => {
      $(selector).addEventListener("click", openPrivacy);
    });
    $("#start-button").addEventListener("click", beginFlow);
    $("#read-questions-button").addEventListener("click", () => showScreen("all-questions-screen"));
    $("#questions-home").addEventListener("click", () => showScreen("welcome-screen"));
    $("#questions-start").addEventListener("click", beginFlow);
    $("#intro-back").addEventListener("click", () => showScreen("welcome-screen"));
    $("#eligibility").addEventListener("change", (event) => {
      $("#intro-continue").disabled = !event.target.checked;
    });
    $("#intro-continue").addEventListener("click", () => {
      currentQuestion = 0;
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
      if (currentQuestion === questions.length - 1) return renderResults();
      currentQuestion += 1;
      renderQuestion();
    });
    $("#edit-answers").addEventListener("click", () => {
      currentQuestion = 0;
      showScreen("quiz-screen");
      renderQuestion();
    });
    $("#data-consent").addEventListener("change", (event) => {
      $("#submit-answers").disabled = !event.target.checked || submitted || !databaseConfigured();
      if (!databaseConfigured()) $("#submission-status").textContent = "Community contribution is not connected yet.";
    });
    $("#submit-answers").addEventListener("click", submitContribution);
    $("#share-site").addEventListener("click", shareSite);
    $("#start-over").addEventListener("click", resetAssessment);

    document.addEventListener("keydown", (event) => {
      if ($("#quiz-screen").hidden || event.altKey || event.ctrlKey || event.metaKey) return;
      const value = Number(event.key);
      if (Number.isInteger(value) && value >= 0 && value <= 5) {
        const input = $(`#response-options input[value="${value}"]`);
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  initialise();
})();
