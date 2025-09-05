// Content script: inject a tiny overlay and compute a rough token estimate.
// Heuristic: tokens ≈ ceil(chars / 4). No external deps.
// Shows Green/Yellow/Red based on thresholds and offers two actions.


(() => {

    const OPTIONS = {
        greenMax: 4000,
        yellowMax: 12000,
        lastN: 20, // default; updated from storage
        hideWhenGreen: false // can be toggled later via UI
    };


    // Load synced option: lastN
    if (chrome?.storage?.sync) {
        chrome.storage.sync.get({ lastN: 20 }, (data) => {
            if (typeof data?.lastN === "number") OPTIONS.lastN = data.lastN;
        });
    }


    // Heuristic estimator
    function estimateTokensFromText(text) {
        if (!text) return 0;
        const chars = text.length;
        return Math.ceil(chars / 4);
    }


    function selectMessageNodes() {
        // Try multiple selectors for resilience as Chat UI evolves
        const selectors = [
            '[data-message-author-role]',
            '[data-testid="conversation-turn"]',
            'main article',
            'main div.markdown',
            'div[data-message-id]'
        ];
        let nodes = [];
        for (const sel of selectors) {
            const found = Array.from(document.querySelectorAll(sel));
            if (found.length) nodes = nodes.concat(found);
        }
        nodes = Array.from(new Set(nodes));
        if (nodes.length === 0) nodes = [document.body];
        return nodes;
    }


    function textsFromNodes(nodes) {
        const out = [];
        for (const n of nodes) {
            const t = (n.innerText || n.textContent || "").trim();
            if (t) out.push(t);
        }
        return out;
    }


    // --- Overlay UI
    let shadowHost, shadowRoot, fillEl, labelEl;
    function mountOverlay() {
        if (document.getElementById("chat-context-health-overlay-host")) return;


        shadowHost = document.createElement("div");
        shadowHost.id = "chat-context-health-overlay-host";
        shadowHost.style.position = "fixed";
        shadowHost.style.bottom = "16px";
        shadowHost.style.right = "16px";
        shadowHost.style.zIndex = "2147483647";
        shadowRoot = shadowHost.attachShadow({ mode: "open" });


        // Load external CSS into shadow root
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL("src/styles/overlay.css");
        shadowRoot.appendChild(link);


        const wrap = document.createElement("div");
        wrap.className = "wrap";


        const card = document.createElement("div");
        card.className = "card";


        labelEl = document.createElement("div");
        labelEl.className = "label";
        labelEl.textContent = "Context: computing…";


        const bar = document.createElement("div");
        bar.className = "bar";


        fillEl = document.createElement("div");
        fillEl.className = "fill";
        bar.appendChild(fillEl);


        const buttons = document.createElement("div");
        buttons.className = "buttons";


        const makeBtn = (text, title, handler) => {
            const b = document.createElement("button");
            b.className = "button";
            b.textContent = text;
            b.title = title;
            b.addEventListener("click", handler);
            return b;
        };


        const summarizeBtn = makeBtn(
            "Summarize & Continue",
            "Ask the assistant to checkpoint the last N messages and proceed",
            () => {
                const N = OPTIONS.lastN;
                const prompt = `Summarize the last ${N} messages into a compact technical checkpoint (<200 tokens). Use only that summary going forward; ignore older context unless referenced.`;
                sendPrompt(prompt);
            }
        );


        const trimBtn = makeBtn(
            "Trim Old Context",
            "Keep only summaries + last 10 turns",
            () => {
                sendPrompt("From now on, keep only compact summaries and the last 10 turns in active context unless I explicitly say otherwise.");
            }
        );


        buttons.appendChild(summarizeBtn);
        buttons.appendChild(trimBtn);


        card.appendChild(labelEl);
        card.appendChild(bar);
        card.appendChild(buttons);
        wrap.appendChild(card);
        shadowRoot.appendChild(wrap);
        document.documentElement.appendChild(shadowHost);
    }

    function updateOverlay(tokensVisible, tokensLastN) {
        if (!shadowRoot) return;
        const greenMax = OPTIONS.greenMax || 4000;
        const yellowMax = OPTIONS.yellowMax || 12000;
        const maxTok = Math.max(tokensVisible, tokensLastN);


        let health = "green";
        if (maxTok > yellowMax) health = "red";
        else if (maxTok > greenMax) health = "yellow";


        const cap = Math.max(yellowMax * 1.25, 1);
        const pct = Math.min(100, Math.round((maxTok / cap) * 100));
        fillEl.style.width = pct + "%";


        // color via inline since it changes dynamically
        fillEl.style.background = health === "green" ? "#4caf50" : health === "yellow" ? "#ffb300" : "#e53935";


        labelEl.textContent = `Context: ${health.toUpperCase()} • Visible≈${tokensVisible.toLocaleString()}t • last${OPTIONS.lastN}≈${tokensLastN.toLocaleString()}t`;
        shadowHost.classList.toggle("hidden", (OPTIONS.hideWhenGreen && health === "green"));
    }

    async function sendPrompt(text) {
        const ta = document.querySelector('#prompt-textarea');
        
        if (!ta) { alert("Couldn't find the chat input."); return; }

        ta.focus();
        document.execCommand("selectAll", false, null);
        document.execCommand("delete", false, null);
        document.execCommand("insertText", false, text);

        ta.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            data: text,
            inputType: "insertText",
            isComposing: false
        }));

        await new Promise(r => setTimeout(r, 60));

        const sendBtn = document.querySelector('button[aria-label*="Send Prompt" i]') ||
            document.querySelector('button[data-testid="send-button"]');
        if (sendBtn) {
            sendBtn.click();
            return;
        }

        // Fallback: simulate Enter key (may be blocked by UI settings)
        const ke = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true });
        ta.dispatchEvent(ke);
    }

    let computeScheduled = false;
    function scheduleCompute() {
        if (computeScheduled) return;
        computeScheduled = true;
        setTimeout(() => { computeScheduled = false; compute(); }, 250);
    }

    function compute() {
        try {
            const nodes = selectMessageNodes();
            const texts = textsFromNodes(nodes);
            const all = texts.join("\n\n");
            const lastN = texts.slice(-OPTIONS.lastN).join("\n\n");
            const tokensVisible = estimateTokensFromText(all);
            const tokensLastN = estimateTokensFromText(lastN);
            updateOverlay(tokensVisible, tokensLastN);
        } catch (e) {
            // swallow errors; keep overlay alive
        }
    }

    function init() {
        mountOverlay();
        compute();
        const mo = new MutationObserver(scheduleCompute);
        mo.observe(document.body, { childList: true, subtree: true });
        window.addEventListener("resize", scheduleCompute);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
