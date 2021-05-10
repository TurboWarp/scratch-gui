/* generated by pull.js */
import AddonRunner from "../../api.js";
import manifest from "./addon.json";
import l10n from "./l10n.js";
const runner = new AddonRunner("onion-skinning", manifest);
runner.l10n(l10n);
runner.userscript("userscript.js", () => require("./userscript.js"));
runner.userstyle("style.css", () => require("!!raw-loader!./style.css"));
runner.run();
