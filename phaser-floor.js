(function defineDcOpsPhaserFloor(global) {
  "use strict";

  const WORLD_WIDTH = 1440;
  const WORLD_HEIGHT = 640;
  const PLAYER_SPEED = 270;
  const INTERACTION_RANGE = 108;
  const DEPTH_BASE = 1000;
  const HUD_OVERLAY_DEPTH = 3000;
  const DEBUG_OVERLAY_DEPTH = 5000;
  const RENDER_RESOLUTION = Math.min(Number(global.devicePixelRatio) || 1, 2);
  const PLAYER_VISUAL_SIZE = Object.freeze({ width: 150, height: 140 });
  const PLAYER_COLLISION = Object.freeze({ width: 34, height: 20, offsetX: 0, offsetY: 0 });
  const PROMPT_HALF_SIZE = Object.freeze({ width: 82, height: 25 });
  const RACK_ROW_START_X = 390;
  const RACK_COLUMN_SPACING = 170;
  const ACTIVE_VISUAL_PACK = "ops-front-v2";
  const TARGET_VISUAL_PACK = "ops-front-v2";
  const VISUAL_PACKS = Object.freeze({
    "ops-sheet-v1": Object.freeze({
      ready: true,
      artDirection: "three-quarter-fallback",
      styleSource: "assets/v1.1/source/data-center-ops-asset-sheet.png",
      background: Object.freeze({
        key: "room-shell-main",
        type: "image",
        path: "assets/v1.1/environment/room-shell-main.png"
      }),
      racks: Object.freeze({
        normal: Object.freeze({ key: "rack-normal", type: "image", path: "assets/v1.1/racks/rack-normal-v2.png" }),
        warning: Object.freeze({ key: "rack-warning", type: "image", path: "assets/v1.1/racks/rack-warning-v2.png" }),
        critical: Object.freeze({ key: "rack-critical", type: "image", path: "assets/v1.1/racks/rack-critical-v2.png" })
      }),
      equipment: Object.freeze({
        "ups-a": Object.freeze({ key: "ups-a", type: "image", path: "assets/v1.1/equipment/ups-v1.png" }),
        "pdu-a": Object.freeze({ key: "pdu-a", type: "image", path: "assets/v1.1/equipment/pdu-v1.png" }),
        "pdu-b": Object.freeze({ key: "pdu-b", type: "image", path: "assets/v1.1/equipment/pdu-v1.png" }),
        "crac-a": Object.freeze({ key: "crac-a", type: "image", path: "assets/v1.1/equipment/crac-v1.png" })
      }),
      operator: Object.freeze({
        basePath: "assets/v1.1/operators/operator-ops-v1",
        type: "image",
        extension: "png",
        walkFrames: 2,
        frameRate: 8,
        displaySize: PLAYER_VISUAL_SIZE,
        origin: Object.freeze({ x: 0.5, y: 0.9 })
      }),
      ui: Object.freeze({
        warning: Object.freeze({ key: "warning-diamond", type: "svg", path: "assets/ui/warning-diamond.svg", loadSize: Object.freeze({ width: 80, height: 80 }) })
      })
    }),
    "ops-front-v2": Object.freeze({
      ready: true,
      artDirection: "front-facing",
      styleSource: Object.freeze([
        "assets/v1.1/source/ops-front-v2-equipment-sheet.png",
        "assets/v1.1/source/ops-front-v2-operator-sheet.png"
      ]),
      background: Object.freeze({
        key: "room-shell-main",
        type: "image",
        path: "assets/v1.1/environment/room-shell-main.png"
      }),
      racks: Object.freeze({
        normal: Object.freeze({ key: "rack-normal", type: "image", path: "assets/v1.1/ops-front-v2/racks/rack-normal.png" }),
        warning: Object.freeze({ key: "rack-warning", type: "image", path: "assets/v1.1/ops-front-v2/racks/rack-warning.png" }),
        critical: Object.freeze({ key: "rack-critical", type: "image", path: "assets/v1.1/ops-front-v2/racks/rack-critical.png" })
      }),
      equipment: Object.freeze({
        "ups-a": Object.freeze({ key: "ups-a", type: "image", path: "assets/v1.1/ops-front-v2/equipment/ups.png" }),
        "pdu-a": Object.freeze({ key: "pdu-a", type: "image", path: "assets/v1.1/ops-front-v2/equipment/pdu-a.png" }),
        "pdu-b": Object.freeze({ key: "pdu-b", type: "image", path: "assets/v1.1/ops-front-v2/equipment/pdu-b.png" }),
        "crac-a": Object.freeze({ key: "crac-a", type: "image", path: "assets/v1.1/ops-front-v2/equipment/crac.png" })
      }),
      operator: Object.freeze({
        basePath: "assets/v1.1/ops-front-v2/operators/operator-a",
        type: "image",
        extension: "png",
        walkFrames: 4,
        frameRate: 10,
        displaySize: Object.freeze({ width: 96, height: 120 }),
        origin: Object.freeze({ x: 0.5, y: 0.92 })
      }),
      profiles: Object.freeze({
        rack: Object.freeze({
          width: 112,
          height: 180,
          origin: Object.freeze({ x: 0.5, y: 0.92 }),
          footOffsetRatio: 0,
          prompt: Object.freeze({ x: 0, y: -172 }),
          warning: Object.freeze({ x: 46, y: -146 }),
          shadow: Object.freeze({ width: 102, height: 16, offsetX: 0, offsetY: 2, alpha: 0.26 })
        }),
        "ups-a": Object.freeze({
          width: 111,
          height: 180,
          origin: Object.freeze({ x: 0.5, y: 0.92 }),
          footOffsetRatio: 0,
          prompt: Object.freeze({ x: 0, y: -172 }),
          shadow: Object.freeze({ width: 108, height: 18, offsetX: 0, offsetY: 2, alpha: 0.28 })
        }),
        "pdu-a": Object.freeze({
          width: 79,
          height: 160,
          origin: Object.freeze({ x: 0.5, y: 0.92 }),
          footOffsetRatio: 0,
          prompt: Object.freeze({ x: 0, y: -152 }),
          shadow: Object.freeze({ width: 82, height: 16, offsetX: 0, offsetY: 2, alpha: 0.26 })
        }),
        "pdu-b": Object.freeze({
          width: 79,
          height: 160,
          origin: Object.freeze({ x: 0.5, y: 0.92 }),
          footOffsetRatio: 0,
          prompt: Object.freeze({ x: 0, y: -152 }),
          shadow: Object.freeze({ width: 82, height: 16, offsetX: 0, offsetY: 2, alpha: 0.26 })
        }),
        "crac-a": Object.freeze({
          width: 217,
          height: 220,
          origin: Object.freeze({ x: 0.5, y: 0.92 }),
          footOffsetRatio: 0,
          prompt: Object.freeze({ x: 0, y: -210 }),
          shadow: Object.freeze({ width: 128, height: 20, offsetX: 0, offsetY: 2, alpha: 0.3 })
        })
      }),
      ui: Object.freeze({
        warning: Object.freeze({ key: "warning-diamond", type: "svg", path: "assets/ui/warning-diamond.svg", loadSize: Object.freeze({ width: 80, height: 80 }) })
      })
    })
  });
  const ASSET_PROFILES = Object.freeze({
    rack: Object.freeze({
      width: 154,
      height: 218,
      origin: Object.freeze({ x: 0.5, y: 0.68 }),
      collision: Object.freeze({ width: 96, height: 40, offsetX: 0, offsetY: -4 }),
      interaction: Object.freeze({ width: 170, height: 170, offsetX: 0, offsetY: -15 }),
      prompt: Object.freeze({ x: 0, y: -145 }),
      warning: Object.freeze({ x: 60, y: -98 }),
      shadow: Object.freeze({ width: 122, height: 18, offsetX: 0, offsetY: 2, alpha: 0.28 })
    }),
    "ups-a": Object.freeze({
      width: 170,
      height: 210,
      origin: Object.freeze({ x: 0.5, y: 0.68 }),
      collision: Object.freeze({ width: 108, height: 42, offsetX: 0, offsetY: -4 }),
      interaction: Object.freeze({ width: 190, height: 175, offsetX: 0, offsetY: -28 }),
      prompt: Object.freeze({ x: 0, y: -130 }),
      shadow: Object.freeze({ width: 112, height: 20, offsetX: 0, offsetY: 2, alpha: 0.3 })
    }),
    "pdu-a": Object.freeze({
      width: 144,
      height: 198,
      origin: Object.freeze({ x: 0.5, y: 0.68 }),
      collision: Object.freeze({ width: 86, height: 40, offsetX: 0, offsetY: -4 }),
      interaction: Object.freeze({ width: 160, height: 155, offsetX: 0, offsetY: -24 }),
      prompt: Object.freeze({ x: 0, y: -122 }),
      shadow: Object.freeze({ width: 74, height: 18, offsetX: 0, offsetY: 2, alpha: 0.28 })
    }),
    "pdu-b": Object.freeze({
      width: 144,
      height: 198,
      origin: Object.freeze({ x: 0.5, y: 0.68 }),
      collision: Object.freeze({ width: 86, height: 40, offsetX: 0, offsetY: -4 }),
      interaction: Object.freeze({ width: 160, height: 155, offsetX: 0, offsetY: -24 }),
      prompt: Object.freeze({ x: 0, y: -122 }),
      shadow: Object.freeze({ width: 74, height: 18, offsetX: 0, offsetY: 2, alpha: 0.28 })
    }),
    "crac-a": Object.freeze({
      width: 202,
      height: 202,
      origin: Object.freeze({ x: 0.5, y: 0.68 }),
      collision: Object.freeze({ width: 120, height: 52, offsetX: 0, offsetY: -4 }),
      interaction: Object.freeze({ width: 210, height: 205, offsetX: 0, offsetY: -34 }),
      prompt: Object.freeze({ x: 0, y: -146 }),
      shadow: Object.freeze({ width: 164, height: 22, offsetX: 0, offsetY: 2, alpha: 0.32 })
    })
  });
  const DIRECTIONS = Object.freeze(["north", "south", "west", "east"]);
  const KEY_TO_DIRECTION = Object.freeze({
    ArrowUp: "north",
    ArrowDown: "south",
    ArrowLeft: "west",
    ArrowRight: "east"
  });
  const DIRECTION_FILE_NAMES = Object.freeze({
    north: "up",
    south: "down",
    west: "left",
    east: "right"
  });
  const DIRECTION_VECTORS = Object.freeze({
    north: Object.freeze({ x: 0, y: -1 }),
    south: Object.freeze({ x: 0, y: 1 }),
    west: Object.freeze({ x: -1, y: 0 }),
    east: Object.freeze({ x: 1, y: 0 })
  });
  const OPERATOR_TEXTURES = Object.freeze(
    DIRECTIONS.flatMap((direction) => [
      `operator-idle-${direction}`,
      ...Array.from(
        { length: VISUAL_PACKS[ACTIVE_VISUAL_PACK].operator.walkFrames },
        (_, index) => `operator-walk-${direction}-${index + 1}`
      )
    ])
  );

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function getMovementIntent(input = {}, lastDirection = "south") {
    const active = DIRECTIONS.filter((direction) => Boolean(input[direction]));
    if (!active.length) return Object.freeze({ x: 0, y: 0, direction: lastDirection, moving: false });
    const direction = active.includes(lastDirection) ? lastDirection : active[0];
    const vector = DIRECTION_VECTORS[direction];
    return Object.freeze({ x: vector.x, y: vector.y, direction, moving: true });
  }

  function gridToWorld(position) {
    return Object.freeze({
      x: clamp(240 + (Number(position?.x) - 1) * 80, 104, WORLD_WIDTH - 104),
      y: clamp(125 + (Number(position?.y) - 1) * 66, 130, WORLD_HEIGHT - 74)
    });
  }

  function worldToGrid(position) {
    return Object.freeze({
      x: clamp(Math.round((Number(position?.x) - 240) / 80) + 1, 1, 12),
      y: clamp(Math.round((Number(position?.y) - 125) / 66) + 1, 1, 8)
    });
  }

  function worldToMiniMap(position) {
    return Object.freeze({
      xPercent: clamp((Number(position?.x) / WORLD_WIDTH) * 100, 0, 100),
      yPercent: clamp((Number(position?.y) / WORLD_HEIGHT) * 100, 0, 100)
    });
  }

  function depthFromFootY(footY, offset = 0) {
    return DEPTH_BASE + Number(footY) + Number(offset);
  }

  function getPlayerFootPosition(position) {
    return Object.freeze({
      x: Number(position?.x) + PLAYER_COLLISION.offsetX,
      y: Number(position?.y) + PLAYER_COLLISION.offsetY + PLAYER_COLLISION.height / 2
    });
  }

  function isPointInInteractionZone(asset, point) {
    const zone = asset?.interactionZone;
    if (!zone || !point) return false;
    return Math.abs(Number(point.x) - zone.x) <= zone.width / 2
      && Math.abs(Number(point.y) - zone.y) <= zone.height / 2;
  }

  function getVisualPack(packName = ACTIVE_VISUAL_PACK) {
    const visualPack = VISUAL_PACKS[packName];
    if (!visualPack) throw new RangeError(`Unknown Phaser visual pack: ${packName}`);
    return visualPack;
  }

  function getOperatorWalkFrames(packName = ACTIVE_VISUAL_PACK) {
    const frameCount = Math.max(1, Math.trunc(Number(getVisualPack(packName).operator.walkFrames) || 1));
    return Object.freeze(Array.from({ length: frameCount }, (_, index) => index + 1));
  }

  function getOperatorTextureKeys(packName = ACTIVE_VISUAL_PACK) {
    const walkFrames = getOperatorWalkFrames(packName);
    return Object.freeze(DIRECTIONS.flatMap((direction) => [
      `operator-idle-${direction}`,
      ...walkFrames.map((frame) => `operator-walk-${direction}-${frame}`)
    ]));
  }

  function getOperatorDisplay(packName = ACTIVE_VISUAL_PACK) {
    const operator = getVisualPack(packName).operator;
    return Object.freeze({
      size: operator.displaySize || PLAYER_VISUAL_SIZE,
      origin: operator.origin || Object.freeze({ x: 0.5, y: 0.9 })
    });
  }

  function getRackTextureKey(rack = {}, packName = ACTIVE_VISUAL_PACK) {
    const racks = getVisualPack(packName).racks;
    if (rack.incident) return racks.critical.key;
    const rackState = Object.hasOwn(racks, rack.state) ? rack.state : "normal";
    return racks[rackState].key;
  }

  function getEquipmentTextureKey(asset = {}, packName = ACTIVE_VISUAL_PACK) {
    return getVisualPack(packName).equipment[asset.id]?.key || null;
  }

  function getAssetProfile(asset, packName = ACTIVE_VISUAL_PACK) {
    const baseProfile = ASSET_PROFILES[asset.id] || ASSET_PROFILES[asset.type] || ASSET_PROFILES.rack;
    const packProfiles = getVisualPack(packName).profiles;
    const visualProfile = packProfiles?.[asset.id] || packProfiles?.[asset.type];
    if (!visualProfile) return baseProfile;
    return Object.freeze({
      ...baseProfile,
      ...visualProfile,
      collision: baseProfile.collision,
      interaction: baseProfile.interaction
    });
  }

  function buildSceneLayout(assets = [], packName = ACTIVE_VISUAL_PACK) {
    return assets.map((asset) => {
      const fallback = gridToWorld(asset);
      let x = fallback.x;
      let y = fallback.y;
      const profile = getAssetProfile(asset, packName);
      const displayWidth = profile.width;
      const displayHeight = profile.height;
      const footOffsetRatio = Number.isFinite(profile.footOffsetRatio) ? profile.footOffsetRatio : 0.34;
      let footY = y + displayHeight * footOffsetRatio;

      if (asset.type === "rack") {
        x = RACK_ROW_START_X + ((asset.rackId - 1) % 5) * RACK_COLUMN_SPACING;
        footY = asset.rackId <= 5 ? 300.84 : 526;
        y = footY - displayHeight * footOffsetRatio;
      } else if (asset.id === "ups-a") {
        x = 174; footY = 257.44;
        y = footY - displayHeight * footOffsetRatio;
      } else if (asset.id === "pdu-a") {
        x = 174; footY = 383.36;
        y = footY - displayHeight * footOffsetRatio;
      } else if (asset.id === "pdu-b") {
        x = 174; footY = 509.36;
        y = footY - displayHeight * footOffsetRatio;
      } else if (asset.id === "crac-a") {
        x = 1260; footY = 403.68;
        y = footY - displayHeight * footOffsetRatio;
      }

      const collision = Object.freeze({
        ...profile.collision,
        x: x + profile.collision.offsetX,
        y: footY + profile.collision.offsetY - profile.collision.height / 2
      });
      const interactionZone = Object.freeze({
        ...profile.interaction,
        x: x + profile.interaction.offsetX,
        y: footY + profile.interaction.offsetY
      });

      return Object.freeze({
        ...asset,
        x,
        y,
        displayWidth,
        displayHeight,
        origin: profile.origin,
        collision,
        interactionZone,
        footY,
        depthPivotY: footY,
        interactionAnchor: Object.freeze({
          x: x + profile.prompt.x,
          y: y + profile.prompt.y
        }),
        warningAnchor: Object.freeze({
          x: x + (profile.warning?.x ?? displayWidth * 0.43),
          y: y + (profile.warning?.y ?? -displayHeight * 0.43)
        }),
        shadow: profile.shadow
      });
    });
  }

  function create(options = {}) {
    const Phaser = global.Phaser;
    const Floor = options.floorApi || global.DCOpsFloor;
    const parent = options.parent;
    if (!Phaser || !Floor || !parent) {
      const error = new Error("Phaser Floor prerequisites are unavailable.");
      options.onError?.(error);
      throw error;
    }

    const state = {
      ready: false,
      destroyed: false,
      rackStates: [],
      operatorId: "rookie",
      language: "ko",
      shiftState: null,
      activeIncidentRackId: null,
      selectedRackId: null,
      nearbyAssetId: null,
      facing: "north",
      lastPositionSentAt: 0,
      scene: null,
      player: null,
      cursors: null,
      interactKey: null,
      assetViews: new Map(),
      lastDirection: "north",
      tapDirection: null,
      pendingInteract: false,
      wasMoving: false,
      externalInput: { north: false, south: false, west: false, east: false },
      loadFailed: false,
      loadFailureKey: null
    };
    state.debugEnabled = options.debug === true;
    state.debugViews = [];
    const layout = buildSceneLayout(Floor.FLOOR_ASSETS);
    const layoutById = new Map(layout.map((asset) => [asset.id, asset]));

    function safeCallback(name, ...args) {
      try {
        options[name]?.(...args);
      } catch (error) {
        global.console?.error?.(`[Phaser Floor] ${name} callback failed`, error);
      }
    }

    function loadSvg(scene, key, path, svgConfig) {
      scene.load.svg(key, path, svgConfig);
    }

    function loadVisualAsset(scene, definition) {
      if (definition.type === "image") {
        scene.load.image(definition.key, definition.path);
        return;
      }
      loadSvg(scene, definition.key, definition.path, definition.loadSize);
    }

    function preload() {
      const visualPack = getVisualPack();
      this.load.once("loaderror", (file) => {
        state.loadFailed = true;
        state.loadFailureKey = file?.key || "unknown";
      });
      loadVisualAsset(this, visualPack.background);
      Object.values(visualPack.racks).forEach((definition) => loadVisualAsset(this, definition));
      Object.values(visualPack.equipment).forEach((definition) => loadVisualAsset(this, definition));
      loadVisualAsset(this, visualPack.ui.warning);
      DIRECTIONS.forEach((direction) => {
        const fileDirection = DIRECTION_FILE_NAMES[direction];
        loadVisualAsset(this, {
          key: `operator-idle-${direction}`,
          type: visualPack.operator.type,
          path: `${visualPack.operator.basePath}/idle-${fileDirection}.${visualPack.operator.extension}`,
          loadSize: visualPack.operator.loadSize
        });
        getOperatorWalkFrames().forEach((frame) => {
          loadVisualAsset(this, {
            key: `operator-walk-${direction}-${frame}`,
            type: visualPack.operator.type,
            path: `${visualPack.operator.basePath}/walk-${fileDirection}-${frame}.${visualPack.operator.extension}`,
            loadSize: visualPack.operator.loadSize
          });
        });
      });
    }

    function addStaticFootprint(scene, group, asset) {
      const footprint = scene.add.rectangle(
        asset.collision.x,
        asset.collision.y,
        asset.collision.width,
        asset.collision.height,
        0xff00ff,
        0
      );
      scene.physics.add.existing(footprint, true);
      group.add(footprint);
      return footprint;
    }

    function addDebugZone(scene, zone, color, label) {
      if (!state.debugEnabled) return null;
      const rectangle = scene.add.rectangle(zone.x, zone.y, zone.width, zone.height, color, 0.12)
        .setStrokeStyle(2, color, 0.95)
        .setDepth(DEBUG_OVERLAY_DEPTH);
      const caption = scene.add.text(zone.x - zone.width / 2 + 4, zone.y - zone.height / 2 + 3, label, {
        fontFamily: "Consolas, monospace",
        fontSize: "10px",
        color: "#ffffff",
        backgroundColor: "rgba(2, 7, 12, .82)",
        padding: { x: 2, y: 1 }
      }).setDepth(DEBUG_OVERLAY_DEPTH + 1);
      state.debugViews.push(rectangle, caption);
      return rectangle;
    }

    function addBoundary(scene, group, x, y, width, height) {
      const wall = scene.add.rectangle(x, y, width, height, 0x00ffff, 0);
      scene.physics.add.existing(wall, true);
      group.add(wall);
    }

    function addRoom(scene) {
      scene.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, getVisualPack().background.key)
        .setOrigin(0.5)
        .setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT)
        .setDepth(-100);
    }

    function createAnimations(scene) {
      const visualPack = getVisualPack();
      DIRECTIONS.forEach((direction) => {
        scene.anims.create({
          key: `operator-walk-${direction}`,
          frames: getOperatorWalkFrames().map((frame) => ({ key: `operator-walk-${direction}-${frame}` })),
          frameRate: visualPack.operator.frameRate,
          repeat: -1
        });
      });
    }

    function addContactShadow(scene, asset) {
      const shadow = asset.shadow;
      if (!shadow) return null;
      return scene.add.ellipse(
        asset.x + shadow.offsetX,
        asset.footY + shadow.offsetY,
        shadow.width,
        shadow.height,
        0x010509,
        shadow.alpha
      ).setDepth(depthFromFootY(asset.depthPivotY, -3));
    }

    function addSceneGrade(scene) {
      const grade = scene.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x102631, 0.025)
        .setDepth(DEPTH_BASE + WORLD_HEIGHT + 100);
      if (Phaser.BlendModes?.MULTIPLY !== undefined) grade.setBlendMode(Phaser.BlendModes.MULTIPLY);
      state.sceneGrade = grade;
    }

    function addAsset(scene, asset, colliders) {
      const texture = asset.type === "rack" ? getRackTextureKey() : getEquipmentTextureKey(asset);
      const shadow = addContactShadow(scene, asset);
      const visual = scene.add.image(asset.x, asset.y, texture)
        .setDisplaySize(asset.displayWidth, asset.displayHeight)
        .setOrigin(asset.origin.x, asset.origin.y)
        .setDepth(depthFromFootY(asset.depthPivotY));
      const label = scene.add.text(asset.x, asset.footY + 14, asset.label, {
        fontFamily: "Consolas, monospace",
        fontStyle: "bold",
        fontSize: asset.type === "rack" ? "13px" : "12px",
        color: asset.type === "rack" ? "#d5fbff" : "#ffd477",
        backgroundColor: "rgba(4, 11, 18, .86)",
        padding: { x: 5, y: 2 }
      }).setOrigin(0.5, 0).setDepth(depthFromFootY(asset.depthPivotY, 3));
      const warning = scene.add.image(asset.warningAnchor.x, asset.warningAnchor.y, "warning-diamond")
        .setDisplaySize(40, 40)
        .setDepth(HUD_OVERLAY_DEPTH)
        .setVisible(false);
      scene.tweens.add({ targets: warning, scale: { from: 0.86, to: 1.05 }, alpha: { from: 0.7, to: 1 }, duration: 620, yoyo: true, repeat: -1 });
      const footprint = addStaticFootprint(scene, colliders, asset);
      addDebugZone(scene, asset.collision, 0xff4fa3, `${asset.label} BODY`);
      addDebugZone(scene, asset.interactionZone, 0x39e7ff, `${asset.label} INTERACT`);
      state.assetViews.set(asset.id, { visual, label, warning, shadow, footprint, asset });
    }

    function addInteractionPrompt(scene) {
      const panel = scene.add.graphics();
      panel.fillStyle(0x06131d, 0.94).fillRoundedRect(-82, -25, 164, 50, 11);
      panel.lineStyle(2, 0x62f4ff, 0.9).strokeRoundedRect(-82, -25, 164, 50, 11);
      const key = scene.add.text(-57, 0, "E", {
        fontFamily: "Consolas, monospace",
        fontStyle: "bold",
        fontSize: "22px",
        color: "#06131d",
        backgroundColor: "#72f4ff",
        padding: { x: 8, y: 4 }
      }).setOrigin(0.5);
      const text = scene.add.text(18, 0, "INTERACT", {
        fontFamily: "Consolas, monospace",
        fontStyle: "bold",
        fontSize: "15px",
        color: "#ffffff"
      }).setOrigin(0.5);
      state.promptText = text;
      state.prompt = scene.add.container(0, 0, [panel, key, text]).setDepth(HUD_OVERLAY_DEPTH + 1).setVisible(false);
    }

    function createPlayer(scene) {
      const operatorDisplay = getOperatorDisplay();
      const initial = options.initialPlayer?.worldX && options.initialPlayer?.worldY
        ? { x: options.initialPlayer.worldX, y: options.initialPlayer.worldY }
        : gridToWorld(options.initialPlayer || { x: 6, y: 7 });
      state.playerRing = scene.add.ellipse(initial.x, initial.y + 4, 54, 18, 0x72f4ff, 0.2)
        .setStrokeStyle(2, 0x72f4ff, 0.9)
        .setDepth(initial.y - 1);
      state.playerAura = scene.add.circle(initial.x, initial.y - 43, 31, 0x72f4ff, 0.1)
        .setStrokeStyle(2, 0x72f4ff, 0.55)
        .setDepth(initial.y - 0.5);
      state.playerLabel = scene.add.text(initial.x, initial.y - 96, "OPS", {
        fontFamily: "Consolas, monospace",
        fontStyle: "bold",
        fontSize: "11px",
        color: "#d8ffff",
        backgroundColor: "rgba(3, 10, 15, .82)",
        padding: { x: 4, y: 2 }
      }).setOrigin(0.5).setDepth(initial.y + 2);
      const player = scene.physics.add.image(initial.x, initial.y, "operator-idle-north")
        .setVisible(false)
        .setCollideWorldBounds(true);
      player.body.setSize(PLAYER_COLLISION.width, PLAYER_COLLISION.height, true);
      state.playerVisual = scene.add.sprite(initial.x, initial.y, "operator-idle-north")
        .setOrigin(operatorDisplay.origin.x, operatorDisplay.origin.y)
        .setDisplaySize(operatorDisplay.size.width, operatorDisplay.size.height)
        .setDepth(depthFromFootY(getPlayerFootPosition(initial).y));
      if (state.debugEnabled) {
        state.playerDebugBody = addDebugZone(scene, {
          x: initial.x + PLAYER_COLLISION.offsetX,
          y: initial.y + PLAYER_COLLISION.offsetY,
          width: PLAYER_COLLISION.width,
          height: PLAYER_COLLISION.height
        }, 0x67ff71, "PLAYER BODY");
        state.playerDebugLabel = state.debugViews[state.debugViews.length - 1];
      }
      state.player = player;
      return player;
    }

    function applyOperator() {
      if (!state.player) return;
      state.playerVisual?.clearTint();
      const luna = state.operatorId === "luna";
      if (luna) state.playerVisual?.setTint(0xd6b6ff);
      state.playerRing?.setFillStyle(luna ? 0xb687ff : 0x72f4ff, 0.2)
        .setStrokeStyle(2, luna ? 0xb687ff : 0x72f4ff, 0.9);
      state.playerAura?.setFillStyle(luna ? 0xb687ff : 0x72f4ff, 0.1)
        .setStrokeStyle(2, luna ? 0xb687ff : 0x72f4ff, 0.55);
      state.playerLabel?.setText(luna ? "LUNA" : "OPS").setColor(luna ? "#e5d2ff" : "#d8ffff");
    }

    function rackStateFor(rackId) {
      return state.rackStates.find((rack) => rack.rackId === rackId) || { state: "normal" };
    }

    function applyRackStates() {
      state.assetViews.forEach((view) => {
        if (view.asset.type !== "rack") return;
        const rack = rackStateFor(view.asset.rackId);
        const incident = Boolean(rack.incident || state.activeIncidentRackId === view.asset.rackId);
        view.visual.setTexture(getRackTextureKey({ ...rack, incident }))
          .setDisplaySize(view.asset.displayWidth, view.asset.displayHeight)
          .setOrigin(view.asset.origin.x, view.asset.origin.y)
          .setPosition(view.asset.x, view.asset.y);
        view.warning.setVisible(incident);
        view.label.setColor(incident ? "#ff6f75" : rack.selected ? "#72f4ff" : "#d5fbff");
      });
    }

    function translatePrompt() {
      if (!state.promptText) return;
      state.promptText.setText(state.language === "ko" ? "상호작용" : "INTERACT");
    }

    function emitPlayerPosition(force = false) {
      if (!state.player) return;
      const now = global.performance?.now?.() ?? Date.now();
      if (!force && now - state.lastPositionSentAt < 80) return;
      state.lastPositionSentAt = now;
      const world = { x: state.player.x, y: state.player.y, facing: state.facing };
      parent.dataset.playerX = state.player.x.toFixed(2);
      parent.dataset.playerY = state.player.y.toFixed(2);
      parent.dataset.playerFacing = state.facing;
      safeCallback("onPlayerPositionChange", {
        ...world,
        grid: worldToGrid(world),
        miniMap: worldToMiniMap(world)
      });
    }

    function findNearbyAsset() {
      if (!state.player) return null;
      const playerFoot = getPlayerFootPosition(state.player);
      return layout
        .filter((asset) => isPointInInteractionZone(asset, playerFoot))
        .map((asset) => ({
          asset,
          distance: Math.hypot(asset.interactionZone.x - playerFoot.x, asset.interactionZone.y - playerFoot.y)
        }))
        .sort((a, b) => {
          const rackPriority = Number(b.asset.type === "rack") - Number(a.asset.type === "rack");
          return rackPriority || a.distance - b.distance;
        })[0]?.asset || null;
    }

    function updateNearbyAsset() {
      const nearby = findNearbyAsset();
      const nextId = nearby?.id || null;
      if (nextId !== state.nearbyAssetId) {
        state.nearbyAssetId = nextId;
        parent.dataset.nearbyAsset = nextId || "";
        safeCallback("onNearbyAssetChange", nextId);
      }
      if (!state.prompt) return;
      state.prompt.setVisible(Boolean(nearby));
      if (nearby) {
        state.prompt.setPosition(
          clamp(nearby.interactionAnchor.x, PROMPT_HALF_SIZE.width, WORLD_WIDTH - PROMPT_HALF_SIZE.width),
          clamp(nearby.interactionAnchor.y, PROMPT_HALF_SIZE.height, WORLD_HEIGHT - PROMPT_HALF_SIZE.height)
        );
      }
    }

    function createScene() {
      if (state.loadFailed) {
        const error = new Error(`Phaser Floor asset failed to load: ${state.loadFailureKey}`);
        parent.dataset.phaserReady = "false";
        safeCallback("onError", error);
        global.setTimeout(() => this.game.destroy(true), 0);
        return;
      }
      state.scene = this;
      parent.dataset.debugFloor = state.debugEnabled ? "true" : "false";
      parent.dataset.visualPack = ACTIVE_VISUAL_PACK;
      this.cameras.main.setBackgroundColor("#02070c");
      this.physics.world.setBounds(82, 104, WORLD_WIDTH - 164, WORLD_HEIGHT - 146);
      addRoom(this);
      createAnimations(this);

      const colliders = this.physics.add.staticGroup();
      layout.forEach((asset) => addAsset(this, asset, colliders));
      addBoundary(this, colliders, WORLD_WIDTH / 2, 106, WORLD_WIDTH - 120, 28);
      addBoundary(this, colliders, 80, WORLD_HEIGHT / 2, 30, WORLD_HEIGHT - 130);
      addBoundary(this, colliders, WORLD_WIDTH - 80, WORLD_HEIGHT / 2, 30, WORLD_HEIGHT - 130);
      addBoundary(this, colliders, WORLD_WIDTH / 2, WORLD_HEIGHT - 46, WORLD_WIDTH - 120, 30);

      const player = createPlayer(this);
      this.physics.add.collider(player, colliders);
      addSceneGrade(this);
      addInteractionPrompt(this);
      this.cursors = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.UP,
        down: Phaser.Input.Keyboard.KeyCodes.DOWN,
        left: Phaser.Input.Keyboard.KeyCodes.LEFT,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT
      }, false, false);
      this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
      state.cursors = this.cursors;
      state.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E, false, false);
      this.input.keyboard.on("keydown", (event) => {
        if (options.canCaptureInput?.() === false) return;
        const direction = KEY_TO_DIRECTION[event.key];
        if (direction) {
          state.lastDirection = direction;
          state.tapDirection = direction;
        }
        if (event.key.toLowerCase() === "e") state.pendingInteract = true;
      });
      this.input.on("pointerdown", () => parent.querySelector("canvas")?.focus({ preventScroll: true }));
      parent.querySelector("canvas")?.setAttribute("tabindex", "0");

      applyOperator();
      applyRackStates();
      translatePrompt();
      updateNearbyAsset();
      emitPlayerPosition(true);
      parent.dataset.debugOverlayCount = String(state.debugViews.length);
      state.ready = true;
      parent.dataset.phaserReady = "true";
      safeCallback("onReady", controller);
    }

    function stopPlayer() {
      if (!state.player) return;
      const operatorDisplay = getOperatorDisplay();
      state.player.setVelocity(0, 0);
      state.playerVisual?.anims.stop();
      state.playerVisual?.setTexture(`operator-idle-${state.facing}`)
        .setDisplaySize(operatorDisplay.size.width, operatorDisplay.size.height)
        .setOrigin(operatorDisplay.origin.x, operatorDisplay.origin.y);
    }

    function updateScene() {
      if (!state.player || !state.cursors) return;
      const canCapture = options.canCaptureInput?.() !== false;
      if (!canCapture) {
        state.tapDirection = null;
        state.pendingInteract = false;
        state.wasMoving = false;
        DIRECTIONS.forEach((direction) => { state.externalInput[direction] = false; });
        stopPlayer();
        updateNearbyAsset();
        return;
      }

      const intent = getMovementIntent({
        north: state.cursors.up.isDown || state.externalInput.north || state.tapDirection === "north",
        south: state.cursors.down.isDown || state.externalInput.south || state.tapDirection === "south",
        west: state.cursors.left.isDown || state.externalInput.west || state.tapDirection === "west",
        east: state.cursors.right.isDown || state.externalInput.east || state.tapDirection === "east"
      }, state.lastDirection);
      state.tapDirection = null;
      if (intent.moving) {
        state.facing = intent.direction;
        state.player.setVelocity(intent.x * PLAYER_SPEED, intent.y * PLAYER_SPEED);
        state.playerVisual?.anims.play(`operator-walk-${intent.direction}`, true);
      } else {
        stopPlayer();
      }
      const playerFoot = getPlayerFootPosition(state.player);
      const playerDepth = depthFromFootY(playerFoot.y);
      state.playerVisual?.setPosition(state.player.x, state.player.y).setDepth(playerDepth);
      state.playerRing?.setPosition(state.player.x, playerFoot.y - 1).setDepth(playerDepth - 2);
      state.playerAura?.setPosition(state.player.x, state.player.y - 51).setDepth(playerDepth - 1);
      state.playerLabel?.setPosition(state.player.x, state.player.y - 96).setDepth(HUD_OVERLAY_DEPTH);
      state.playerDebugBody?.setPosition(
        state.player.x + PLAYER_COLLISION.offsetX,
        state.player.y + PLAYER_COLLISION.offsetY
      );
      state.playerDebugLabel?.setPosition(
        state.player.x + PLAYER_COLLISION.offsetX - PLAYER_COLLISION.width / 2 + 4,
        state.player.y + PLAYER_COLLISION.offsetY - PLAYER_COLLISION.height / 2 + 3
      );
      updateNearbyAsset();
      emitPlayerPosition(intent.moving || state.wasMoving);
      state.wasMoving = intent.moving;

      const interactionRequested = state.pendingInteract || Phaser.Input.Keyboard.JustDown(state.interactKey);
      state.pendingInteract = false;
      if (interactionRequested && state.nearbyAssetId) safeCallback("onAssetInteract", state.nearbyAssetId);
    }

    const config = {
      type: Phaser.AUTO,
      parent,
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      resolution: RENDER_RESOLUTION,
      transparent: true,
      pixelArt: false,
      antialias: true,
      physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { powerPreference: "high-performance", roundPixels: false },
      scene: { preload, create: createScene, update: updateScene },
      callbacks: {
        postBoot: () => {
          parent.querySelector("canvas")?.setAttribute("aria-label", "Interactive 2D data center Floor scene");
        }
      }
    };

    let game;
    let controller;
    try {
      game = new Phaser.Game(config);
    } catch (error) {
      parent.dataset.phaserReady = "false";
      safeCallback("onError", error);
      throw error;
    }

    controller = Object.freeze({
      isReady: () => state.ready && !state.destroyed,
      focus: () => parent.querySelector("canvas")?.focus({ preventScroll: true }),
      handleKeyDown(key, repeat = false) {
        const direction = KEY_TO_DIRECTION[key];
        if (direction) {
          state.lastDirection = direction;
          state.externalInput[direction] = true;
          if (!repeat) state.tapDirection = direction;
        }
        if (String(key).toLowerCase() === "e" && !repeat) state.pendingInteract = true;
      },
      handleKeyUp(key) {
        const direction = KEY_TO_DIRECTION[key];
        if (direction) state.externalInput[direction] = false;
      },
      setRackStates(rackStates = []) {
        state.rackStates = rackStates.map((rack) => ({ ...rack }));
        applyRackStates();
      },
      setActiveIncidentRack(rackId) {
        state.activeIncidentRackId = Number(rackId) || null;
        applyRackStates();
      },
      setSelectedRack(rackId) {
        state.selectedRackId = Number(rackId) || null;
        applyRackStates();
      },
      setOperator(operatorId) {
        state.operatorId = operatorId === "luna" ? "luna" : "rookie";
        applyOperator();
      },
      setLanguage(language) {
        state.language = language === "en" ? "en" : "ko";
        translatePrompt();
      },
      setShiftState(shiftState) {
        state.shiftState = shiftState ? { ...shiftState } : null;
      },
      getDebugState() {
        return Object.freeze({
          ready: state.ready,
          player: state.player ? Object.freeze({ x: state.player.x, y: state.player.y, facing: state.facing }) : null,
          nearbyAssetId: state.nearbyAssetId,
          operatorId: state.operatorId,
          language: state.language,
          renderer: game?.renderer?.type === Phaser.WEBGL ? "Phaser.WEBGL" : "Phaser.CANVAS",
          resolution: RENDER_RESOLUTION,
          world: Object.freeze({ width: WORLD_WIDTH, height: WORLD_HEIGHT }),
          velocity: state.player?.body?.velocity
            ? Object.freeze({ x: state.player.body.velocity.x, y: state.player.body.velocity.y })
            : null,
          speed: PLAYER_SPEED,
          visualPack: ACTIVE_VISUAL_PACK,
          textureCount: getOperatorTextureKeys().length,
          debugEnabled: state.debugEnabled,
          playerFoot: state.player ? getPlayerFootPosition(state.player) : null,
          playerBody: state.player?.body
            ? Object.freeze({ width: state.player.body.width, height: state.player.body.height })
            : null
        });
      },
      destroy() {
        state.destroyed = true;
        state.ready = false;
        game.destroy(true);
      }
    });

    global.__dcOpsPhaserFloorDebug = Object.freeze({ getState: controller.getDebugState });
    return controller;
  }

  const api = Object.freeze({
    WORLD_WIDTH,
    WORLD_HEIGHT,
    PLAYER_SPEED,
    INTERACTION_RANGE,
    DEPTH_BASE,
    RENDER_RESOLUTION,
    PLAYER_COLLISION,
    RACK_ROW_START_X,
    RACK_COLUMN_SPACING,
    ACTIVE_VISUAL_PACK,
    TARGET_VISUAL_PACK,
    VISUAL_PACKS,
    ASSET_PROFILES,
    OPERATOR_TEXTURES,
    getMovementIntent,
    gridToWorld,
    worldToGrid,
    worldToMiniMap,
    depthFromFootY,
    getPlayerFootPosition,
    isPointInInteractionZone,
    getVisualPack,
    getOperatorWalkFrames,
    getOperatorTextureKeys,
    getOperatorDisplay,
    getAssetProfile,
    getRackTextureKey,
    getEquipmentTextureKey,
    buildSceneLayout,
    create
  });

  global.DCOpsPhaserFloor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
