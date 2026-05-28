// ============================================================
// Configuration
// ============================================================
const ORIGINAL_W = 1773;
const ORIGINAL_H = 2261;

const ANIMALS = {
    cricket: {
        id: "cricket",
        name: "蟋蟀",
        image: "animals/image_cricket.png",
        sounds: ["audios/audio_cricket_1.mp3", "audios/audio_cricket_2.mp3"],
        allowedLayers: ["farmland"],
        maxCount: 5,
    },
    frog: {
        id: "frog",
        name: "蛙蛙",
        image: "animals/image_frog.png",
        sounds: ["audios/audio_frog_1.mp3", "audios/audio_frog_2.mp3"],
        allowedLayers: ["lotus", "grass"],
        maxCount: 5,
    },
    tawny_owl: {
        id: "tawny_owl",
        name: "灰林鸮",
        image: "animals/image_tawny_owl.png",
        sounds: [
            "audios/audio_tawny_owl_1.mp3",
            "audios/audio_tawny_owl_2.mp3",
            "audios/audio_tawny_owl_3.mp3",
        ],
        allowedLayers: ["forest"],
        maxCount: 5,
    },
    nailong: {
        id: "nailong",
        name: "奶龙",
        image: "animals/image_nailong.png",
        sounds: ["audios/audio_nailong_1.mp3", "audios/audio_nailong_2.mp3"],
        allowedLayers: ["grass", "farmland"],
        maxCount: 5,
    },
};

const INTERVAL_TIERS = {
    1: { min: 3000, max: 8000, label: "很频繁 (3-8秒)" },
    2: { min: 8000, max: 15000, label: "较频繁 (8-15秒)" },
    3: { min: 15000, max: 30000, label: "正常 (15-30秒)" },
    4: { min: 30000, max: 60000, label: "较少 (30-60秒)" },
    5: { min: 60000, max: 120000, label: "很少 (60-120秒)" },
};

const VALIDATION_LAYERS = ["farmland", "lotus", "grass", "forest"];

// ============================================================
// State
// ============================================================
let placedAnimals = [];
let nextAnimalId = 1;
let layerCanvases = {};       // { layerName: Canvas }
let animalImages = {};         // { animalType: HTMLImageElement } — preloaded
let mapReady = false;

let dragInfo = null;
let intervalTiers = {};        // { animalType: tierNumber }

let masterVolume = 0.7;
let bgmVolume = 0.6;
let bgmAudio = null;
let bgmType = "none";

// ============================================================
// DOM Elements
// ============================================================
const mapContainer = document.getElementById("map-container");
const placedLayer = document.getElementById("placed-animals-layer");
const animalList = document.getElementById("animal-list");
const bgmRadios = document.getElementsByName("bgm");
const masterVolumeSlider = document.getElementById("master-volume");
const volumeLabel = document.getElementById("volume-label");
const bgmVolumeSlider = document.getElementById("bgm-volume");
const bgmVolumeLabel = document.getElementById("bgm-volume-label");

// ============================================================
// Preload: layer canvases + animal images
// ============================================================
function loadLayerCanvas(layerName) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = ORIGINAL_W;
            canvas.height = ORIGINAL_H;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            layerCanvases[layerName] = canvas;
            resolve();
        };
        img.onerror = () => {
            console.warn("Failed to load layer:", layerName);
            resolve();
        };
        img.src = `background_images/${layerName}.png`;
    });
}

function loadAnimalImage(animalType) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            animalImages[animalType] = img;
            resolve();
        };
        img.onerror = () => {
            console.warn("Failed to load animal image:", animalType);
            resolve();
        };
        img.src = ANIMALS[animalType].image;
    });
}

async function preloadAll() {
    const layerPromises = VALIDATION_LAYERS.map(loadLayerCanvas);
    const animalPromises = Object.keys(ANIMALS).map(loadAnimalImage);
    await Promise.all([...layerPromises, ...animalPromises]);
    mapReady = true;
    console.log("All assets preloaded.");
}

// ============================================================
// Pixel validation
// ============================================================
function isPositionValid(animalType, mapX, mapY) {
    if (!mapReady) return false;

    const mapRect = mapContainer.getBoundingClientRect();
    const scaleX = ORIGINAL_W / mapRect.width;
    const scaleY = ORIGINAL_H / mapRect.height;
    const imgX = Math.floor(mapX * scaleX);
    const imgY = Math.floor(mapY * scaleY);

    if (imgX < 0 || imgX >= ORIGINAL_W || imgY < 0 || imgY >= ORIGINAL_H) {
        return false;
    }

    const allowedLayers = ANIMALS[animalType].allowedLayers;
    for (const layerName of allowedLayers) {
        const canvas = layerCanvases[layerName];
        if (!canvas) continue;
        const ctx = canvas.getContext("2d");
        const pixel = ctx.getImageData(imgX, imgY, 1, 1).data;
        if (pixel[3] > 0) return true;
    }
    return false;
}

// ============================================================
// Volume from Y position (larger Y = lower on screen = louder)
// ============================================================
function getVolumeForY(mapY, mapHeight) {
    const ratio = Math.max(0, Math.min(1, mapY / mapHeight));
    return 0.15 + ratio * 0.85;
}

// ============================================================
// Build Animal List UI
// ============================================================
function buildAnimalList() {
    animalList.innerHTML = "";
    for (const [key, animal] of Object.entries(ANIMALS)) {
        if (!intervalTiers[key]) intervalTiers[key] = 3;

        const entry = document.createElement("div");
        entry.className = "animal-entry";

        entry.innerHTML = `
            <div class="animal-entry-header" data-animal="${key}">
                <img class="animal-thumb" src="${animal.image}" alt="${animal.name}" draggable="false">
                <div class="animal-info">
                    <div class="animal-name">${animal.name}</div>
                    <div class="animal-count" id="count-${key}">已放置: 0 / ${animal.maxCount}</div>
                </div>
            </div>
            <div class="interval-control">
                <span class="interval-label">叫声间隔:</span>
                <select class="interval-select" data-animal="${key}">
                    ${Object.entries(INTERVAL_TIERS)
                        .map(
                            ([tier, info]) =>
                                `<option value="${tier}" ${intervalTiers[key] == tier ? "selected" : ""}>${info.label}</option>`
                        )
                        .join("")}
                </select>
            </div>
        `;

        const header = entry.querySelector(".animal-entry-header");
        header.addEventListener("mousedown", (e) => {
            e.preventDefault();
            startDragFromList(key, e.clientX, e.clientY);
        });

        header.addEventListener("dblclick", () => {
            placeAtRandomPosition(key);
        });

        const select = entry.querySelector(".interval-select");
        select.addEventListener("change", () => {
            intervalTiers[key] = parseInt(select.value);
            rescheduleAnimalType(key);
        });

        animalList.appendChild(entry);
    }
}

function updateAnimalCount(animalType) {
    const count = placedAnimals.filter((a) => a.type === animalType).length;
    const max = ANIMALS[animalType].maxCount;
    const countEl = document.getElementById(`count-${animalType}`);
    if (countEl) {
        countEl.textContent = `已放置: ${count} / ${max}`;
    }
}

// ============================================================
// Drag ghost
// ============================================================
function getOrCreateGhost() {
    let ghost = document.getElementById("drag-ghost");
    if (!ghost) {
        ghost = document.createElement("canvas");
        ghost.id = "drag-ghost";
        ghost.style.cssText =
            "position:fixed;pointer-events:none;z-index:1000;display:block;";
        document.body.appendChild(ghost);
    }
    return ghost;
}

function drawGhost(animalType, valid) {
    const ghost = getOrCreateGhost();
    const preloadedImg = animalImages[animalType];
    const size = 64;
    ghost.width = size;
    ghost.height = size;
    ghost.style.width = size + "px";
    ghost.style.height = size + "px";
    ghost.style.display = "block";

    const ctx = ghost.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    if (preloadedImg) {
        ctx.drawImage(preloadedImg, 0, 0, size, size);
    }

    ctx.fillStyle = valid
        ? "rgba(0, 200, 0, 0.45)"
        : "rgba(220, 30, 30, 0.45)";
    ctx.fillRect(0, 0, size, size);

    return ghost;
}

function positionGhost(clientX, clientY) {
    if (!dragInfo) return;
    dragInfo.ghostEl.style.left = clientX - dragInfo.offsetX + "px";
    dragInfo.ghostEl.style.top = clientY - dragInfo.offsetY + "px";
}

function syncGhostColor(clientX, clientY) {
    if (!dragInfo) return;
    const mapRect = mapContainer.getBoundingClientRect();
    const mapX = clientX - mapRect.left;
    const mapY = clientY - mapRect.top;
    const valid = isPositionValid(dragInfo.animalType, mapX, mapY);
    drawGhost(dragInfo.animalType, valid);
}

// ============================================================
// Drag from list
// ============================================================
function startDragFromList(animalType, clientX, clientY) {
    const count = placedAnimals.filter((a) => a.type === animalType).length;
    if (count >= ANIMALS[animalType].maxCount) return;

    const mapRect = mapContainer.getBoundingClientRect();
    const mapX = clientX - mapRect.left;
    const mapY = clientY - mapRect.top;
    const valid = isPositionValid(animalType, mapX, mapY);
    const ghost = drawGhost(animalType, valid);

    dragInfo = {
        animalType,
        ghostEl: ghost,
        offsetX: ghost.width / 2,
        offsetY: ghost.height / 2,
        sourcePlacedId: null,
    };
    positionGhost(clientX, clientY);

    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragUp);
}

function startDragFromMap(placedId, clientX, clientY) {
    const placed = placedAnimals.find((a) => a.id === placedId);
    if (!placed) return;

    if (placed.timerId) {
        clearTimeout(placed.timerId);
        placed.timerId = null;
    }

    // Reset offset instantly when starting drag
    const el = document.getElementById(`placed-${placedId}`);
    if (el) {
        const inner = el.querySelector(".placed-animal-inner");
        if (inner) {
            inner.classList.remove("animate");
            inner.style.transform = "translate(0px, 0px)";
            const img = inner.querySelector("img");
            if (img) img.style.transform = "scaleX(1)";
        }
        el.style.visibility = "hidden";
    }
    placed.offsetX = 0;
    placed.offsetY = 0;

    const mapRect = mapContainer.getBoundingClientRect();
    const mapX = clientX - mapRect.left;
    const mapY = clientY - mapRect.top;
    const valid = isPositionValid(placed.type, mapX, mapY);
    const ghost = drawGhost(placed.type, valid);

    dragInfo = {
        animalType: placed.type,
        ghostEl: ghost,
        offsetX: ghost.width / 2,
        offsetY: ghost.height / 2,
        sourcePlacedId: placedId,
    };
    positionGhost(clientX, clientY);

    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragUp);
}

function onDragMove(e) {
    if (!dragInfo) return;
    positionGhost(e.clientX, e.clientY);
    syncGhostColor(e.clientX, e.clientY);
}

function onDragUp(e) {
    if (!dragInfo) return;

    const mapRect = mapContainer.getBoundingClientRect();
    const mapX = e.clientX - mapRect.left;
    const mapY = e.clientY - mapRect.top;

    const overMap =
        e.clientX >= mapRect.left &&
        e.clientX <= mapRect.right &&
        e.clientY >= mapRect.top &&
        e.clientY <= mapRect.bottom;

    if (overMap && isPositionValid(dragInfo.animalType, mapX, mapY)) {
        if (dragInfo.sourcePlacedId !== null) {
            repositionAnimal(dragInfo.sourcePlacedId, mapX, mapY);
        } else {
            placeAnimal(dragInfo.animalType, mapX, mapY);
        }
    } else if (dragInfo.sourcePlacedId !== null) {
        const el = document.getElementById(`placed-${dragInfo.sourcePlacedId}`);
        if (el) el.style.visibility = "visible";
        scheduleCall(dragInfo.sourcePlacedId);
    }

    cleanupDrag();
}

function cleanupDrag() {
    if (dragInfo && dragInfo.ghostEl) {
        dragInfo.ghostEl.style.display = "none";
    }
    dragInfo = null;
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragUp);
}

// ============================================================
// Place / Reposition / Remove
// ============================================================
function placeAnimal(animalType, mapX, mapY) {
    const count = placedAnimals.filter((a) => a.type === animalType).length;
    if (count >= ANIMALS[animalType].maxCount) return;

    const id = nextAnimalId++;
    const mapRect = mapContainer.getBoundingClientRect();
    const pctX = (mapX / mapRect.width) * 100;
    const pctY = (mapY / mapRect.height) * 100;

    const animal = { id, type: animalType, pctX, pctY, offsetX: 0, offsetY: 0, timerId: null };
    placedAnimals.push(animal);

    renderPlacedAnimal(animal);
    updateAnimalCount(animalType);
    scheduleCall(id);
}

function repositionAnimal(id, mapX, mapY) {
    const animal = placedAnimals.find((a) => a.id === id);
    if (!animal) return;

    const mapRect = mapContainer.getBoundingClientRect();
    animal.pctX = (mapX / mapRect.width) * 100;
    animal.pctY = (mapY / mapRect.height) * 100;
    animal.offsetX = 0;
    animal.offsetY = 0;

    const el = document.getElementById(`placed-${id}`);
    if (el) {
        el.style.left = animal.pctX + "%";
        el.style.top = animal.pctY + "%";
        el.style.visibility = "visible";
        const inner = el.querySelector(".placed-animal-inner");
        if (inner) {
            inner.classList.remove("animate");
            inner.style.transform = "translate(0px, 0px)";
            const img = inner.querySelector("img");
            if (img) img.style.transform = "scaleX(1)";
        }
    }
    scheduleCall(id);
}

function removeAnimal(id) {
    const animal = placedAnimals.find((a) => a.id === id);
    if (!animal) return;

    if (animal.timerId) {
        clearTimeout(animal.timerId);
    }
    placedAnimals = placedAnimals.filter((a) => a.id !== id);

    const el = document.getElementById(`placed-${id}`);
    if (el) el.remove();

    updateAnimalCount(animal.type);
}

function placeAtRandomPosition(animalType) {
    const count = placedAnimals.filter((a) => a.type === animalType).length;
    if (count >= ANIMALS[animalType].maxCount) return;

    const mapRect = mapContainer.getBoundingClientRect();
    for (let attempt = 0; attempt < 200; attempt++) {
        const rx = Math.random() * mapRect.width;
        const ry = Math.random() * mapRect.height;
        if (isPositionValid(animalType, rx, ry)) {
            placeAnimal(animalType, rx, ry);
            return;
        }
    }
    alert(`无法为${ANIMALS[animalType].name}找到有效的放置位置，请尝试手动拖拽。`);
}

// ============================================================
// Render placed animal DOM
// ============================================================
function renderPlacedAnimal(animal) {
    const div = document.createElement("div");
    div.className = "placed-animal";
    div.id = `placed-${animal.id}`;
    div.style.left = animal.pctX + "%";
    div.style.top = animal.pctY + "%";

    const inner = document.createElement("div");
    inner.className = "placed-animal-inner";
    inner.style.transform = "translate(0px, 0px)";

    const img = document.createElement("img");
    img.src = ANIMALS[animal.type].image;
    img.draggable = false;
    img.style.transform = "scaleX(1)";
    inner.appendChild(img);
    div.appendChild(inner);

    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.textContent = "×";
    delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeAnimal(animal.id);
    });
    div.appendChild(delBtn);

    div.addEventListener("mousedown", (e) => {
        if (e.target === delBtn) return;
        e.preventDefault();
        e.stopPropagation();
        startDragFromMap(animal.id, e.clientX, e.clientY);
    });

    placedLayer.appendChild(div);
}

// ============================================================
// Audio scheduling
// ============================================================
function scheduleCall(animalId) {
    const animal = placedAnimals.find((a) => a.id === animalId);
    if (!animal) return;

    if (animal.timerId) {
        clearTimeout(animal.timerId);
    }

    const tier = intervalTiers[animal.type] || 3;
    const range = INTERVAL_TIERS[tier];
    const delay = range.min + Math.random() * (range.max - range.min);

    animal.timerId = setTimeout(() => {
        playAnimalSound(animal);
        scheduleCall(animalId);
    }, delay);
}

function playAnimalSound(animal) {
    const soundList = ANIMALS[animal.type].sounds;
    const soundSrc = soundList[Math.floor(Math.random() * soundList.length)];

    const mapRect = mapContainer.getBoundingClientRect();
    const mapY = (animal.pctY / 100) * mapRect.height;
    const posVolume = getVolumeForY(mapY, mapRect.height);
    const finalVolume = posVolume * masterVolume;

    const el = document.getElementById(`placed-${animal.id}`);
    if (el) {
        const inner = el.querySelector(".placed-animal-inner");
        const img = inner ? inner.querySelector("img") : null;
        const maxRadius = 30 + Math.random() * 50; // 30-80 px

        // Try random offsets until one stays within the allowed region
        const basePxX = (animal.pctX / 100) * mapRect.width;
        const basePxY = (animal.pctY / 100) * mapRect.height;
        let newOx = animal.offsetX || 0;
        let newOy = animal.offsetY || 0;
        let foundValid = false;

        for (let attempt = 0; attempt < 60; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * maxRadius;
            const ox = Math.cos(angle) * dist;
            const oy = Math.sin(angle) * dist;
            const targetX = basePxX + ox;
            const targetY = basePxY + oy;
            if (isPositionValid(animal.type, targetX, targetY)) {
                newOx = ox;
                newOy = oy;
                foundValid = true;
                break;
            }
        }
        // If no valid offset found, keep current position (don't move)

        // Flip toward movement direction
        const oldOx = animal.offsetX || 0;
        const moveDx = newOx - oldOx;
        const flip = moveDx < -1 ? -1 : 1;

        // Trigger bounce animation on img (scale + hop + flip)
        // Set inline transform first so the flip persists after animation ends
        if (img) {
            img.style.transform = `scaleX(${flip})`;
            img.style.setProperty("--flip", flip);
            img.classList.remove("bouncing");
            void img.offsetWidth;
            img.classList.add("bouncing");
        }

        // Smooth transition to new offset
        if (inner) {
            inner.classList.add("animate");
            inner.style.transform = `translate(${newOx.toFixed(1)}px, ${newOy.toFixed(1)}px)`;
        }

        animal.offsetX = newOx;
        animal.offsetY = newOy;
    }

    if (finalVolume <= 0) return;

    const audio = new Audio(soundSrc);
    audio.volume = finalVolume;
    audio.play().catch(() => {});
}

function rescheduleAnimalType(animalType) {
    for (const animal of placedAnimals) {
        if (animal.type === animalType) {
            scheduleCall(animal.id);
        }
    }
}

// ============================================================
// Background Music
// ============================================================
function updateBGM() {
    if (bgmAudio) {
        bgmAudio.pause();
        bgmAudio = null;
    }
    if (bgmType === "none") return;

    bgmAudio = new Audio(`background_music/${bgmType}.mp3`);
    bgmAudio.loop = true;
    bgmAudio.volume = bgmVolume;
    bgmAudio.play().catch(() => {});
}

for (const radio of bgmRadios) {
    radio.addEventListener("change", () => {
        if (radio.checked) {
            bgmType = radio.value;
            updateBGM();
        }
    });
}

// ============================================================
// Master Volume
// ============================================================
masterVolumeSlider.addEventListener("input", () => {
    masterVolume = parseInt(masterVolumeSlider.value) / 100;
    volumeLabel.textContent = masterVolumeSlider.value + "%";
});

bgmVolumeSlider.addEventListener("input", () => {
    bgmVolume = parseInt(bgmVolumeSlider.value) / 100;
    bgmVolumeLabel.textContent = bgmVolumeSlider.value + "%";
    if (bgmAudio) {
        bgmAudio.volume = bgmVolume;
    }
});

// ============================================================
// Prevent default HTML5 drag on map
// ============================================================
mapContainer.addEventListener("dragover", (e) => e.preventDefault());
mapContainer.addEventListener("drop", (e) => e.preventDefault());

// ============================================================
// Init
// ============================================================
async function init() {
    buildAnimalList();
    await preloadAll();
}

init();
