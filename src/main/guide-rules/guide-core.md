
# Guide Core

The base for every learning guide and study guide. The learning-guide or study-guide skill decides the guide's overall structure. A subject skill decides what the notes and practice contain for that kind of course. This file holds what every guide shares. If a subject skill and this file disagree, the subject skill wins on what the notes and practice contain, and this file wins on ground rules, structure and how the page looks.

## 1. What a good guide looks like

Picture a well-made textbook section. Headings. Short paragraphs of plain text. Key terms in bold where they're defined. Examples written into the text right after the idea they illustrate. Once in a while, a box for something the student must know exactly. A student can read it top to bottom and follow it. That's the target, plus one quiz at the end of each week.

The failure to avoid: a page where most of the text sits inside colored boxes, a question interrupts every few paragraphs, and tables appear for two-item lists. Each of those pieces seems useful on its own, but together they make a page nobody can study from. Every element has to earn its place against the cost of a longer, busier page.

What follows from that:
- **Plain text is the default.** Explanations, examples, connections and "not the same as" contrasts are normal paragraphs and lists.
- **Boxes depend on content, not quotas.** A box is used only for the kinds of content listed in section 7. A topic with no boxes is normal. A topic with three exact definitions can have three KEY boxes.
- **No questions inside the teaching.** Retrieval happens in the week quiz, and in worked-example blanks where a subject skill calls for them. No out-loud checks, no "pause and think" prompts, no per-topic note reminders.
- **Length follows the material.** A slide with one idea gets a few sentences. A slide with a model or a procedure gets more. Never pad toward a length, and never re-explain an idea later to "reinforce" it.
- **Sections exist only when they have a job.** A section that repeats the table of contents, restates the notes, or holds a single row gets cut.

A topic done right looks like this (the content here is only an illustration of the format):

```html
<h3 id="t4">Cognitive dissonance</h3>
<p><b>Cognitive dissonance</b> is the discomfort people feel when their actions clash with their beliefs. Because the feeling is unpleasant, people try to reduce it, and the easiest fix is often to change the belief rather than undo the action.</p>
<div class="box key"><div class="label">KEY: Cognitive dissonance theory <span class="src">Festinger 1957; slide 4</span></div><p>Holding two inconsistent cognitions creates tension, which motivates people to restore consistency, usually by changing an attitude to fit a behavior they can't take back.</p></div>
<p>Festinger and Carlsmith paid students $1 or $20 to tell the next participant a dull task was fun. The $1 group later rated the task as more enjoyable. With only $1, they had no good outside reason for lying, so they shifted their belief to match what they'd said. For example, someone who buys an expensive phone and then hears it has a weak camera may decide the camera "doesn't matter that much."</p>
<p>Not the same as self-perception theory, which says people infer their attitudes from their behavior without any discomfort involved. The deciding feature is whether tension drives the change.</p>
```

One definition worth knowing exactly gets a box. Everything else, including the study and the examples, is plain text.

## 2. Ground rules

1. Source. Teach only from the uploaded materials. Every fact, rule, definition, list, study and number comes from them. Explain and rephrase so it makes sense, but don't add new content: no extra facts, no extra table columns, no outside material. Practice cases and examples you invent to illustrate the materials' own ideas are fine. Links between ideas should be ones the materials make or that follow plainly from them; don't present your own interpretation as the lecture's. If something from outside is truly needed to understand a point, keep it to a phrase and mark it "(added)". Skip hidden slides entirely; they're hidden for a reason.
2. Match the course exactly: terminology, notation, formats, and any frameworks, standards, theories or models it uses. Cite sources, standards, studies or sections the way the materials do.
3. Use the figures, rates, dates and versions from the materials, not newer ones you know. If something needed isn't there, say so.
4. If something is unclear, incomplete or looks wrong in the materials, flag it with a CHECK: line where the problem is and say what seems off. Don't silently fix or guess.
5. Check every calculation: solve it, recompute it a second, independent way (reverse it, check units, confirm totals reconcile, cross-check by a different method, or for accounting confirm debits equal credits and statements tie out), then do a critical second-pass review looking for wrong inputs, misapplied rules and rounding. Fix any mismatch before including it.
6. Write plainly, like a strong classmate who's good at explaining. Short sentences, no filler. Don't use em dashes. Refer to courses by their names (Income Tax, Auditing), not course codes.
7. When the user sends attempts at any question, check them. If something is wrong, give a hint about the first mistake and let them retry before giving the full fix.

## 3. Research behind every guide

Keep these in mind when making judgment calls:
- Self-testing is the most reliable technique in every subject (classroom meta-analysis g about 0.50, Yang et al. 2021; Dunlosky et al. 2013). Rereading and highlighting are low value on their own. The week quizzes carry this.
- Spacing beats one block of study (Cepeda et al. 2008).
- Practice should match the exam: level first (application practice for application exams; Agarwal 2019), format second (Adesope et al. 2017; Yang et al. 2021).
- Practice transfers best when it uses new cases, not the notes' own examples, and when feedback explains the answer (Pan and Rickard 2018).
- Mixing practice helps only between things that are easy to confuse (Brunmair and Richter 2019).
- Extra, off-topic material lowers learning (g -0.16 to -0.33). Explanations belong right beside what they explain (coherence, contiguity).
- Signaling works only when it's sparse. A few labeled boxes tell the reader what matters most; a page of boxes signals nothing and buries the explanation.
- Hide answers, not teaching. Answers hidden until an attempt drive the testing effect; core explanations hidden behind clicks don't help (Schworm and Renkl 2006).
- Handing over answers too easily hurts learning; hints first (Bastani et al. 2025).
- Confidence ratings next to actual scores expose overconfidence (Koriat and Bjork 2005).

## 4. Structure: organize by week

Students follow their course week by week, so the guide does too.

- Group everything by the course's own units: weeks if the materials use weeks or dated lectures, otherwise chapters, modules or lectures, named the way the course names them.
- Each week is an h2 ("Week 3: Community psychology") with a one-line meta line under it (lecture dates, slide decks). Each topic within it is an h3. Sections inside a topic are h4, only when a topic is long enough to need them.
- The table of contents lists every week, with its topics after it.
- Every week ends with a **week quiz**. Its size follows the week's content: one question for each idea the exam could test, plus one for each pair of look-alikes the week sets up. A light week gets a short quiz, a heavy week a longer one. From the second week on, add 1 or 2 questions from earlier weeks. Use section 5 for format and level and section 6 for item writing. Multiple choice and true/false go in the quiz block. Written or calculation items go in a TRY IT box right after it, with answers in a collapsed section.

## 5. Match practice to the exam

Find the exam format: question types, number of questions, time, and what the instructor says it emphasizes. Look in the materials first (syllabus, slides, notes). Ask only if it's missing, since it changes the practice.

- Match the level first. If the exam asks students to apply or connect ideas, most practice must too. Definition-only practice doesn't carry over to application questions.
- Match the format second. Put most practice in the exam's format and a smaller share in a second format.

| Exam | Practice mix |
|---|---|
| Multiple choice and true/false | About 70% multiple choice, 20% true/false, 10% short "explain the connection". Lean on multiple choice even if the exam has more true/false: it teaches more, and false true/false statements can be misremembered as true. |
| Short answer | Mostly short written answers (recall and explain), some multiple choice |
| Essay | Outlines for likely essay prompts with a model outline in the key, plus multiple choice and true/false for the knowledge underneath |
| Calculations or problems | Full problems at exam difficulty, mixed across look-alike problem types, plus a few concept questions |
| Mixed | Mirror the exam's mix |

If the exam focuses on big ideas, use about one third recall (who, what, definitions) and two thirds application, comparison and connection. If the format is unknown, use that split and say so in one line.

## 6. Writing practice items

**Multiple choice.** A short new scenario or a specific question as the stem. Three or four options. Wrong options are the close neighbors (look-alike concepts, commonly misapplied rules, likely calculation slips), so each is tempting for a reason. One clearly best answer. No "all of the above", "none of the above", double negatives or trick wording. Aim for questions a prepared student gets right about 60 to 75% of the time. Add a hint that points at the deciding feature without giving the answer away.

**True/false.** A claim about a relationship or finding, with a contrast built in ("participants paid $1, rather than $20, rated the task as more enjoyable"). Avoid trivial negations of a sentence from the notes. In a quiz block, the options are True and False.

**Short answer and essay.** A specific prompt. The key gives a model answer or outline with the points a marker would look for.

**Every explanation and answer key entry** gives why the answer is right and why the most tempting wrong option is wrong, in one or two sentences. For a false true/false statement, give the corrected true statement (no need to repeat "False", the answer line already says it). Calculations show full working.

## 7. Presentation

Clean and calm. Nothing decorative: no clip art, images, banners, emoji or icons.

**Boxes.** Four types, each for specific content only. Label word always printed so meaning survives black and white. Color as a thick left border plus a very light tint; body text stays dark.
- **KEY** (blue): the exact thing the exam expects to be known or applied as given: a formal definition the materials quote or attribute, the named parts of a model, a formula, a rule with its conditions and exceptions. Source in the label. Only that core statement goes in the box. The explanation, studies and examples around it stay outside as plain text.
- **WATCH OUT** (vermillion): a specific trap the materials set up or the instructor flags: two terms that are easy to swap, a common wrong answer, an exception people miss. Never general advice or a restatement of the notes.
- **EXAMPLE** (green): only a worked example with several dependent steps (journal entries, a tax computation, an annotated legal case). A one-line or one-paragraph example is plain text.
- **TRY IT** (orange): quizzes, plus worked-example blanks and practice problems where a subject skill calls for them.
- No other boxes. Never put a box inside a box.

**CHECK: flags** are a plain muted line starting "CHECK:", right where the issue is. No box.

**Tables** are for side-by-side comparisons (several items described on the same features) and the course's own table formats (journal entries, schedules). Items that each get one description are a list, not a table.

**Headings.** Title once; h2 per week or major section (with a rule above it); h3 per topic; h4 only inside long topics. Headings name the content.

**Emphasis.** Bold a key term only where it's first defined. No highlighting, colored text, italics for emphasis or all caps.

**Space.** Paragraphs of 3 lines or less. Use numbered steps when content is a sequence.

**Contiguity.** The reason for each step, line or number sits right beside it, never in a separate list below.

**Step labels.** Group multi-step work under short labels saying what each group accomplishes. Use the identical labels and layout in every example of that type.

**Diagrams** only for a real sequence, cycle, cause and effect, or the course's own frame. Simple labeled boxes and arrows next to the text that explains them.

**Page layout.** One centered column about 760px wide, prose around 68 characters per line, off-white background, one readable font family, dark mode supported. Top: title, a one-line course and test line, and the table of contents. Tables scroll sideways on phones instead of breaking the page.

**Scroll progress.** A fixed 3px royal purple bar across the top fills as the user scrolls, with a % chip in the top right.

**Quiz blocks.** Interactive multiple choice and true/false in one box, one question at a time with lettered options. A first wrong pick shows the hint and allows a retry; a second wrong pick (or the only wrong pick on true/false) reveals the answer. Each answer shows the explanation. The score screen shows the first-try score, "Retry missed" and "Start over", and an "Answers and explanations" dropdown in its own rounded, bordered box inside the quiz. The script builds that dropdown automatically. When printed, a quiz shows as a plain question list with its answers on a new page.

**Saved scores.** Each full run of a quiz saves its first-try score in the viewer's browser (retries of missed questions don't overwrite it). The quiz header then shows "last time 5/8", and any element with `data-score="quiz-id"` shows that quiz's latest score, or "not taken yet". Every quiz needs a unique id.

**Confidence rating.** Week quizzes and the final quiz carry `data-ask`. Before question 1 they ask "How sure are you about this material?" with one tap from 1 to 5, and the rating saves with the score. The score screen, and any element with `data-flag="quiz-id"`, compares the two: "Review first: felt sure, missed some" (rated 4 or 5, under 70%), "Better than you thought" (rated 1 or 2, 80% or more), otherwise "On track". `data-conf="quiz-id"` shows the rating, or "not rated". Warm-up quizzes skip the rating, and "Retry missed" never asks again.

**Blanks and answers.** Every blank in a worked example (Example B and similar) is a box the student types into, and it checks itself. `data-ans` holds the correct answer exactly as the collapsed answers give it; separate accepted alternatives with `|` (for example `Supplies Expense|Supplies Exp`). Numbers are matched loosely: $, commas, % and spaces are ignored, parentheses or a minus sign mean negative, a percent answer also accepts the decimal (11.30% or 0.113), and small rounding differences pass (0.1% of the answer, at least 0.015, or at least 0.05 for a percent answer so 16.7% passes for 16.67%; set `data-tol` to change it, for example a looser tolerance on a trial-and-error IRR). Text is matched ignoring case and extra spaces. Pressing Enter or leaving the box checks it: a right answer turns green with a check mark, a first wrong answer says "try again", a second wrong answer shows the answer. Typed answers save in the viewer's browser. Give each blank an `aria-label` naming what goes in it, and ask for one value per blank, with the unit or format clear from the line it sits on. Answers to a worked-example blank or a practice problem go in a collapsed answers section right after that item, with no divider or extra space. Only a study guide's closing answer key sits after a divider and blank space. Practice problems are worked on paper: give the step labels, never rows of empty table lines.

**Print.** It must print cleanly in black and white. When printing, answer sections open automatically and start on a new page.

Use this CSS and these scripts exactly, so every guide looks, works and prints the same:

```css
:root{--bg:#f8f9fb;--surface:#fff;--fg:#18202b;--muted:#4f5b6b;--rule:#d5dbe3;--key:#0072B2;--example:#009E73;--watch:#D55E00;--try:#E69F00;--progress:#45207F;--progress-text:#45207F;--tint:8%;--font:"IBM Plex Sans","Segoe UI",Roboto,Arial,sans-serif;--head:"IBM Plex Sans Condensed","Arial Narrow","IBM Plex Sans",sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#12161c;--surface:#191e26;--fg:#e6eaf0;--muted:#a7b1bf;--rule:#323a46;--progress:#6448A8;--progress-text:#B4A7D6;--tint:16%;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#12161c;--surface:#191e26;--fg:#e6eaf0;--muted:#a7b1bf;--rule:#323a46;--progress:#6448A8;--progress-text:#B4A7D6;--tint:16%;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:16px/1.6 var(--font);margin:0;padding:32px 16px 80px}
main{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
main>*{min-width:0}
h1,h2,h3,h4{font-family:var(--head);line-height:1.2;margin:0;text-wrap:balance}
h1{font-size:2rem;padding-right:72px}h2{font-size:1.6rem;margin-top:28px;padding-top:20px;border-top:2px solid var(--fg)}h3{font-size:1.25rem;margin-top:14px}h4{font-size:1.05rem;margin-top:6px}
p{margin:0;max-width:68ch}.meta{color:var(--muted)}
nav.toc{display:flex;flex-wrap:wrap;gap:8px 14px}nav.toc a{color:var(--key)}
.box{border-left:6px solid var(--c);background:color-mix(in srgb,var(--c) var(--tint),var(--surface));padding:14px 16px;display:flex;flex-direction:column;gap:10px;border-radius:0 4px 4px 0}
.box>*{min-width:0}.box .label{font-weight:700;letter-spacing:.04em}.box .label .src{font-weight:400;letter-spacing:0;color:var(--muted)}
.key{--c:var(--key)}.example{--c:var(--example)}.watch{--c:var(--watch)}.try{--c:var(--try)}
.box ol,.box ul{margin:0;padding-left:1.4em;display:flex;flex-direction:column;gap:6px}
.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.95rem;font-variant-numeric:tabular-nums}
th,td{text-align:left;vertical-align:top;padding:7px 10px;border-bottom:1px solid var(--rule)}th{font-weight:600;border-bottom:2px solid var(--fg)}
td.n,th.n{text-align:right;white-space:nowrap}td.why{color:var(--muted)}td.cue{width:33%;font-weight:600}
.sched-head{text-align:center;font-weight:600;line-height:1.4;max-width:none}
tr.sub td.n{border-top:1.5px solid var(--fg)}
tr.final td.n{border-top:1.5px solid var(--fg);border-bottom:4px double var(--fg);font-weight:600}
.group{font-weight:700;margin-top:8px}
.flag{color:var(--muted);font-size:.92rem}
.blank{display:inline-block;min-width:4.5em;padding:1px 8px;border:1.5px dashed var(--muted);border-radius:3px;text-align:center;color:var(--muted)}
input.blank{font:inherit;color:var(--fg);background:var(--surface);padding:1px 6px;max-width:100%}input.blank:focus{outline:2px solid var(--key);outline-offset:1px;border-style:solid}input.blank.ok{border:1.5px solid var(--example);background:color-mix(in srgb,var(--example) 12%,var(--surface))}input.blank.no{border:1.5px solid var(--watch)}.bm{margin-left:6px;font-size:.9rem;color:var(--muted)}
td.empty{height:2.2em}
.flow{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.flow .step{border:1.5px solid var(--fg);border-radius:4px;padding:6px 10px;background:var(--surface)}.flow .arr{color:var(--muted)}
.divider{border:0;border-top:3px double var(--rule);margin:40px 0 0}.gap{height:80px}
.answer-key{display:flex;flex-direction:column;gap:12px}
details.answers{border:1px solid var(--rule);background:var(--surface);border-radius:4px}
details.answers>summary{cursor:pointer;padding:14px 16px;font-family:var(--head);font-weight:700;font-size:1.3rem}
details.answers>.inner{padding:4px 16px 20px;display:flex;flex-direction:column;gap:16px}
.quiz .q .why{display:none}.quiz.live>.q{display:none}
.qz{display:flex;flex-direction:column;gap:12px}.qz-top{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.qz-top span{color:var(--muted);font-size:.9rem}
.qz-opts{display:flex;flex-direction:column;gap:8px}
.qz button{font:inherit;color:var(--fg);background:var(--surface);border:1.5px solid var(--rule);border-radius:6px;cursor:pointer}
.qz-opts button{display:flex;gap:10px;align-items:flex-start;text-align:left;padding:10px 12px}.qz-opts button b{min-width:1.3em}
.qz button:hover:not(:disabled){border-color:var(--fg)}.qz button:focus-visible{outline:3px solid var(--key);outline-offset:2px}.qz button:disabled{cursor:default}
.qz-opts .ok{border-color:var(--example);background:color-mix(in srgb,var(--example) 14%,var(--surface))}
.qz-opts .no{border-color:var(--watch);background:color-mix(in srgb,var(--watch) 10%,var(--surface))}
.qz-conf{display:flex;gap:8px;flex-wrap:wrap}.qz-conf button{min-width:48px;padding:8px 0;font-weight:700}
.qz-fb:empty{display:none}.qz-nav{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.qz-nav button{padding:6px 14px;border-color:var(--fg)}
.quiz:not(.done) .qkey{display:none}details.qkey{border:1.5px solid color-mix(in srgb,var(--try) 55%,var(--rule));border-radius:8px;background:var(--surface);box-shadow:0 1px 2px rgb(0 0 0/.06)}details.qkey>summary{font-size:1rem;padding:10px 14px}details.qkey[open]>summary{border-bottom:1px solid color-mix(in srgb,var(--try) 30%,var(--rule))}details.qkey>.inner{padding:10px 14px 14px}
.prog{position:fixed;top:0;left:0;right:0;z-index:20;padding-top:env(safe-area-inset-top,0px);height:3px;background:color-mix(in srgb,var(--progress) 10%,transparent);background-clip:content-box;pointer-events:none}.prog i{display:block;height:100%;background:var(--progress);transform-origin:left;transform:scaleX(0)}
.chip{position:fixed;z-index:21;top:calc(14px + env(safe-area-inset-top,0px));right:max(16px,env(safe-area-inset-right,0px));font:600 .85rem/1 var(--font);font-variant-numeric:tabular-nums;color:var(--progress-text);background:color-mix(in srgb,var(--surface) 92%,transparent);border:1px solid color-mix(in srgb,var(--progress) 35%,var(--rule));border-radius:999px;padding:6px 11px;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:0 1px 3px rgb(0 0 0/.08)}
@media print{:root{--bg:#fff;--surface:#fff;--fg:#000;--muted:#333;--tint:6%}body{padding:0;font-size:11pt}.gap,nav.toc,.prog,.chip,.qz{display:none}.quiz.live>.q{display:block}.quiz:not(.done) .qkey,.quiz .qkey{display:block;break-before:page}.answer-key{break-before:page}details.answers{border:0}.box,tr{break-inside:avoid}.quiz{break-inside:auto}}
```

```html
<script>(()=>{const L='ABCD',P='gq:'+location.pathname+':',get=k=>{try{return JSON.parse(localStorage.getItem(P+k))}catch(e){}},fl=v=>v&&v.c?(v.c>3&&v.s/v.n<.7?'Review first: felt sure, missed some':v.c<3&&v.s/v.n>=.8?'Better than you thought':'On track'):'',fill=()=>{document.querySelectorAll('[data-score]').forEach(e=>{const v=get(e.dataset.score);e.textContent=v?v.s+' of '+v.n:'not taken yet'});document.querySelectorAll('[data-conf]').forEach(e=>{const v=get(e.dataset.conf);e.textContent=v&&v.c?v.c+' of 5':'not rated'});document.querySelectorAll('[data-flag]').forEach(e=>e.textContent=fl(get(e.dataset.flag))||'after the quiz')};fill();document.querySelectorAll('.quiz').forEach(z=>{const t=z.dataset.title||'Quiz',D=[...z.querySelectorAll('.q')].map(q=>({s:q.querySelector('.stem').innerHTML,o:[...q.querySelectorAll('li')].map(l=>l.innerHTML),a:L.indexOf(q.dataset.a),h:q.dataset.hint||'',w:q.querySelector('.why').innerHTML}));const k=document.createElement('details');k.className='answers qkey';k.innerHTML=`<summary>Answers and explanations</summary><div class="inner"><ol>${D.map(d=>`<li><b>${L[d.a]}. ${d.o[d.a]}</b> ${d.w}</li>`).join('')}</ol></div>`;const c=document.createElement('div');c.className='qz';z.append(c,k);z.classList.add('live');const K=z.id||t,ask=z.dataset.ask!=null;let cf=null,last=get(K),ord=D.map((_,i)=>i),i=0,sc=0,tr=0,miss=[];const show=()=>{const d=D[ord[i]];tr=0;z.classList.remove('done');c.innerHTML=`<div class="qz-top"><b>${t}</b><span>Question ${i+1} of ${ord.length}${last&&!i?' · last time '+last.s+'/'+last.n:''}</span></div><div>${d.s}</div><div class="qz-opts">${d.o.map((o,j)=>`<button type="button" data-j="${j}"><b>${L[j]}</b><span>${o}</span></button>`).join('')}</div><div class="qz-fb" aria-live="polite"></div><div class="qz-nav">${d.h?'<button type="button" data-x="h">Hint</button>':''}<button type="button" data-x="n" hidden>${i+1<ord.length?'Next':'See score'}</button></div>`};const start=()=>{if(!ask)return show();z.classList.remove('done');c.innerHTML=`<div class="qz-top"><b>${t}</b><span>Before you start</span></div><p>How sure are you about this material?</p><div class="qz-conf">${[1,2,3,4,5].map(n=>`<button type="button" data-c="${n}">${n}</button>`).join('')}</div><p class="meta">1 = not sure at all, 5 = very sure</p>`};const end=()=>{z.classList.add('done');if(ord.length==D.length){last={s:sc,n:D.length,c:cf};try{localStorage.setItem(P+K,JSON.stringify(last))}catch(e){}fill()}c.innerHTML=`<div class="qz-top"><b>${t}</b><span>Done</span></div><p><b>${sc} of ${ord.length}</b> right on the first try.${last&&last.c&&ord.length==D.length?' You rated yourself '+last.c+' of 5. <b>'+fl(last)+'.</b>':''}${miss.length?' To redo: question '+miss.map(m=>ord.indexOf(m)+1).join(', ')+'.':''}</p><div class="qz-nav">${miss.length?'<button type="button" data-x="m">Retry missed</button>':''}<button type="button" data-x="r">Start over</button></div>`};c.onclick=e=>{const b=e.target.closest('button');if(!b)return;const d=D[ord[i]],fb=c.querySelector('.qz-fb'),x=b.dataset.x;if(x=='h'){fb.innerHTML='<b>Hint:</b> '+d.h;b.remove();return}if(x=='n'){++i<ord.length?show():end();return}if(b.dataset.c){cf=+b.dataset.c;show();return}if(x=='r'||x=='m'){ord=x=='m'?miss:D.map((_,i)=>i);miss=[];i=sc=0;x=='r'?start():show();return}const j=+b.dataset.j,bs=c.querySelectorAll('.qz-opts button');if(j==d.a){b.classList.add('ok');tr?miss.push(ord[i]):sc++;bs.forEach(y=>y.disabled=1);fb.innerHTML=`<b>${tr?'Got it.':'Correct.'}</b> ${d.w}`}else{b.classList.add('no');b.disabled=1;if(!tr++&&d.o.length>2){fb.innerHTML='<b>Not quite.</b> '+(d.h?'Hint: '+d.h:'Try again.');c.querySelector('[data-x="h"]')?.remove();return}bs[d.a].classList.add('ok');bs.forEach(y=>y.disabled=1);miss.push(ord[i]);fb.innerHTML=`<b>Not quite. The answer is ${L[d.a]}.</b> ${d.w}`}c.querySelector('[data-x="n"]').hidden=false};start()})})()</script>
<script>(()=>{const f=document.getElementById('pf'),c=document.getElementById('pc');let q=0;const u=()=>{q=0;const m=document.documentElement.scrollHeight-innerHeight,p=m>0?Math.min(1,Math.max(0,scrollY/m)):1,n=Math.round(p*100);f.style.transform=`scaleX(${p})`;c.textContent=n+'%';c.setAttribute('aria-valuenow',n)},r=()=>{if(!q){q=1;requestAnimationFrame(u)}};addEventListener('scroll',r,{passive:true});addEventListener('resize',r);document.addEventListener('toggle',r,true);try{new ResizeObserver(r).observe(document.querySelector('main'))}catch(e){}u();addEventListener('beforeprint',()=>document.querySelectorAll('details.answers').forEach(d=>d.open=true))})()</script>
<script>(()=>{const P='gq:'+location.pathname+':b:',n=s=>{s=String(s).trim();const neg=/^\(.*\)$/.test(s)||/^[-−]/.test(s);s=s.replace(/[$,%\s()−-]/g,'');return s===''||isNaN(s)?null:(neg?-1:1)*parseFloat(s)},t=s=>String(s).toLowerCase().replace(/\s+/g,' ').trim();document.querySelectorAll('input.blank').forEach((b,k)=>{const A=b.dataset.ans.split('|'),tol=b.dataset.tol;let tr=0;b.autocomplete='off';b.style.width=Math.max(7,...A.map(a=>a.length+3))+'ch';if(!b.getAttribute('aria-label'))b.setAttribute('aria-label','Your answer');const m=document.createElement('span');m.className='bm';m.setAttribute('aria-live','polite');b.after(m);const ok=v=>A.some(a=>{const x=n(a),y=n(v);if(x!=null&&y!=null){const d=tol!=null?+tol:Math.max(/%/.test(a)?.05:.015,Math.abs(x)*.001);return[y].concat(/%/.test(a)&&!/%/.test(v)?[y*100]:[]).some(z=>Math.abs(x-z)<=d)}return t(a)==t(v)}),set=(s,sv)=>{b.classList.remove('ok','no');m.textContent=s=='ok'?'✓':s=='no'?(tr>1?'✗ answer: '+A[0]:'✗ try again'):'';s&&b.classList.add(s);if(sv)try{localStorage.setItem(P+k,JSON.stringify({v:b.value,tr}))}catch(e){}};try{const s=JSON.parse(localStorage.getItem(P+k));if(s&&s.v){b.value=s.v;tr=s.tr||0;set(ok(s.v)?'ok':'no')}}catch(e){}b.addEventListener('change',()=>{const v=b.value.trim();if(!v){tr=0;return set('',1)}ok(v)?set('ok',1):(tr++,set('no',1))});b.addEventListener('keydown',e=>{if(e.key=='Enter'){e.preventDefault();b.dispatchEvent(new Event('change'))}})})})()</script>
```

Markup patterns:
- Box: `<div class="box key"><div class="label">KEY: topic <span class="src">source</span></div>...</div>`
- CHECK flag: `<p class="flag">CHECK: what seems off</p>`
- Quiz block (no heading right above it: its `data-title` is the heading, and the table of contents links to its `id`; unique `id`; no numbers in stems; `data-a` is the correct letter; `data-hint` optional but recommended; true/false uses two options, True then False; week and final quizzes add `data-ask`): `<div class="box try quiz" id="w3-quiz" data-title="Week 3 quiz" data-ask><div class="q" data-a="B" data-hint="Hint"><p class="stem">Question</p><ol type="A"><li>Option</li><li>Option</li><li>Option</li></ol><div class="why">Why B is right, and why the tempting wrong option is wrong.</div></div>...</div>`
- Confidence table (headers Week | How sure you felt | First-try score | What to do; every cell uses the quiz's id): `<tr><td>Week 3</td><td data-conf="w3-quiz"></td><td data-score="w3-quiz"></td><td data-flag="w3-quiz"></td></tr>`
- Cue table row (question left, notes right): `<tr><td class="cue">Question</td><td>Notes</td></tr>`
- Flow: `<div class="flow"><span class="step">Step</span><span class="arr">→</span><span class="step">Step</span></div>`
- Schedules: `tr.sub` for subtotals, `tr.final` for the final total, amounts in `td.n`, reasons in `td.why`
- Blank (typed, self-checking): `<input class="blank" data-ans="744.09" aria-label="PV of the face value">`
- Answers right after an item: `<details class="answers"><summary>Answers: try first (name)</summary><div class="inner">...</div></details>`
- Study guide closing answer key: `<hr class="divider"><div class="gap"></div><section class="answer-key"><details class="answers"><summary>Answers: try first (name)</summary><div class="inner">...</div></details></section>` (more than one details block may sit in one section)
- Before `<main>`: `<div class="prog" aria-hidden="true"><i id="pf"></i></div><div class="chip" id="pc" role="progressbar" aria-label="Scroll progress" aria-valuenow="0">0%</div>`; all three scripts after `</main>`, in the order shown

## 8. Quality check (every guide)

Do these before publishing. Fix what fails; don't just note it.

1. **Source:** every fact, rule, study, list and number comes from the materials; nothing added except marked "(added)" phrases.
2. **Coverage:** go through the materials slide by slide (skipping hidden slides) and confirm every testable point appears somewhere. Teach anything missing in its week. This check happens while building; it never appears on the page as a table or section.
3. **Box audit:** list every box on the page with the section 7 rule that allows it. Unbox or delete any box that doesn't fit its rule. Make sure explanations, studies and short examples sit outside KEY boxes.
4. **Read-through:** read one full topic top to bottom as a student would. It should read like a textbook page with an occasional box. If boxes and tables outweigh plain paragraphs, if a question interrupts the teaching, or if the same point appears twice, fix it.
5. **Sections:** every section has a job the rest of the page doesn't already do. Cut any that repeat the table of contents or the notes.
6. **Exam match:** practice format and level match the exam (section 5); practice uses new cases, not the notes' examples.
7. **Explanations:** every quiz item and answer key entry says why it's right and why the most tempting wrong answer is wrong; every false true/false statement is corrected.
8. **Quizzes:** every quiz has a unique id; week and final quizzes have `data-ask`; every item has a stem, 2 to 4 options, a `data-a` letter that matches the right option, and a why.
9. **Accuracy:** every calculation had the independent recompute and the second-pass review; every answer matches its question; every blank's `data-ans` matches the value in its collapsed answers.
10. **Function:** table of contents links work, readable on a phone, quizzes, typed blanks, saved scores, confidence ratings and progress chip work, prints with answers on separate pages.