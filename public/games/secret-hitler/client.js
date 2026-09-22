const params = new URLSearchParams(location.search);
const room = params.get("room");
const isHostUrl = params.get("host") === "1";
const playerName = params.get("name") ?? "";

const el = (id) => document.getElementById(id);

const lobbyView = el("lobby-view");
const roleView = el("role-view");
const tableView = el("table-view");
const backBtn = el("back-btn");
const lobbyRoomCodeEl = el("lobby-room-code");
const copyCodeBtn = el("copy-code-btn");
const lobbyPlayerListEl = el("lobby-player-list");
const dealBtn = el("deal-btn");
const readyToggleBtn = el("ready-toggle-btn");
const lobbyWaitingEl = el("lobby-waiting");
const lobbyHintEl = el("lobby-hint");

const roleBackBtn = el("role-back-btn");
const roleRoomCodeEl = el("role-room-code");
const roleCard = el("role-card");
const roleIcon = el("role-icon");
const roleName = el("role-name");
const roleDesc = el("role-desc");
const roleTeam = el("role-team");
const readyBtn = el("ready-btn");
const readyStripEl = el("ready-strip");
const readyCountEl = el("ready-count");

const tableBackBtn = el("table-back-btn");
const tableRoomCodeEl = el("table-room-code");
const dealAgainBtn = el("deal-again-btn");
const tableWaitingEl = el("table-waiting");
const continueBoardBtn = el("continue-board-btn");

const boardView = el("board-view");
const boardBackBtn = el("board-back-btn");
const boardRoomCodeEl = el("board-room-code");
const boardLiberalTrackEl = el("board-liberal-track");
const boardFascistTrackEl = el("board-fascist-track");
const boardTrackerEl = el("board-tracker");
const boardLibMinusBtn = el("board-lib-minus");
const boardLibPlusBtn = el("board-lib-plus");
const boardFasMinusBtn = el("board-fas-minus");
const boardFasPlusBtn = el("board-fas-plus");
const boardPresidentNameEl = el("board-president-name");
const boardChancellorNameEl = el("board-chancellor-name");
const boardViewerSelect = el("board-viewer-select");
const nominateCtaBtn = el("nominate-cta-btn");
const boardWaitingTextEl = el("board-waiting-text");

const nominateView = el("nominate-view");
const nominateBackBtn = el("nominate-back-btn");
const nominateRoomCodeEl = el("nominate-room-code");
const nominatePresidentNameEl = el("nominate-president-name");
const nomineeListEl = el("nominee-list");
const nominateConfirmBtn = el("nominate-confirm-btn");

const voteView = el("vote-view");
const voteBackBtn = el("vote-back-btn");
const voteRoomCodeEl = el("vote-room-code");
const votePresidentNameEl = el("vote-president-name");
const voteChancellorNameEl = el("vote-chancellor-name");
const voteViewerSelect = el("vote-viewer-select");
const voteJaBtn = el("vote-ja-btn");
const voteNeinBtn = el("vote-nein-btn");
const voteStatusTextEl = el("vote-status-text");
const voteRevealBtn = el("vote-reveal-btn");

const voteRevealView = el("vote-reveal-view");
const voteRevealBackBtn = el("vote-reveal-back-btn");
const voteRevealRoomCodeEl = el("vote-reveal-room-code");
const voteOutcomeBannerEl = el("vote-outcome-banner");
const voteTallyListEl = el("vote-tally-list");
const voteContinueBtn = el("vote-continue-btn");

lobbyRoomCodeEl.textContent = room ?? "(none)";
roleRoomCodeEl.textContent = room ?? "(none)";
tableRoomCodeEl.textContent = room ?? "(none)";
boardRoomCodeEl.textContent = room ?? "(none)";
nominateRoomCodeEl.textContent = room ?? "(none)";
voteRoomCodeEl.textContent = room ?? "(none)";
voteRevealRoomCodeEl.textContent = room ?? "(none)";

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;

const ICONS = {
  liberal: `<svg width="28" height="28" viewBox="0 0 512 512" fill="#ffffff"><path d="M314.685,210.72c-8.365,0-15.028-1.612-20.383-4.096c-8.012-3.71-13.202-9.427-16.468-15.135 c-1.628-2.838-2.755-5.66-3.463-8.144c-0.708-2.476-0.987-4.656-0.979-5.956c0-2.484-2.007-4.491-4.483-4.491 c-2.476,0-4.484,2.007-4.484,4.491c0,1.613,0.198,3.39,0.593,5.347c0.69,3.43,1.973,7.378,4.088,11.466 c3.15,6.096,8.168,12.503,15.67,17.357c1.884,1.242,3.898,2.352,6.087,3.34c0.345,1.488,0.83,4.096,0.823,7.263 c0,2.294-0.255,4.845-0.946,7.469c-0.692,2.624-1.818,5.289-3.628,7.896c-1.39,2.048-0.896,4.828,1.143,6.235 c2.032,1.407,4.821,0.906,6.227-1.134c2.451-3.53,4.006-7.206,4.928-10.702c0.913-3.505,1.233-6.844,1.233-9.764 c0-1.456-0.082-2.83-0.197-4.063c4.31,0.995,9.032,1.587,14.238,1.587c2.476,0,4.484-2.006,4.484-4.483 C319.169,212.728,317.162,210.72,314.685,210.72z"/><path d="M334.558,153.042c-2.155-1.201-4.878-0.461-6.103,1.703c-1.217,2.147-0.452,4.878,1.703,6.103 c3.306,1.892,5.314,3.981,6.663,6.145c-5.528,1.94-10.414,2.747-14.749,2.747c-6.326-0.008-11.499-1.678-15.876-4.244 c-4.352-2.558-7.864-6.07-10.537-9.698c-4.4-6.005-10.117-11.343-16.862-15.242c-6.745-3.882-14.535-6.317-22.908-6.317 c-7.329,0-15.053,1.892-22.719,6.095c-3.126,1.712-5.848,3.718-8.209,5.915c-9.32,3.586-17.34,4.886-24.142,4.886 c-9.681-0.017-16.904-2.6-21.74-5.15c-2.41-1.283-4.212-2.55-5.379-3.471c-0.584-0.468-1.02-0.83-1.284-1.077l-0.263-0.255 l-0.05-0.049c-1.719-1.76-4.541-1.81-6.326-0.1c-1.776,1.719-1.826,4.549-0.115,6.334c0.263,0.256,3.332,3.397,9.229,6.532 c2.582,1.365,5.741,2.706,9.394,3.8c-0.97,1.365-2.296,3.372-3.742,5.905c-2.772,4.895-5.956,11.771-7.568,19.858 c-0.502,2.442,1.078,4.795,3.504,5.28c2.427,0.494,4.779-1.094,5.264-3.521c1.358-6.818,4.154-12.889,6.597-17.191 c1.226-2.172,2.352-3.874,3.167-5.042c0.411-0.568,0.732-1.02,0.954-1.3c0.107-0.14,0.19-0.238,0.238-0.304l0.066-0.066 l0.008-0.016c0.404-0.502,0.675-1.07,0.831-1.678c2.278,0.296,4.672,0.461,7.214,0.461c4.705,0,9.871-0.559,15.431-1.818 c-2.772,5.931-3.899,12.133-3.908,17.809c0.017,5.708,1.103,10.907,3.053,15.037c1.06,2.229,3.734,3.192,5.963,2.13 c2.229-1.062,3.192-3.726,2.13-5.964c-1.242-2.584-2.197-6.68-2.18-11.204c-0.008-4.886,1.061-10.249,3.587-15.16 c2.541-4.902,6.473-9.369,12.585-12.725c6.441-3.538,12.61-4.985,18.409-5.002c6.622,0.017,12.856,1.924,18.433,5.133 c5.561,3.2,10.414,7.724,14.115,12.766c3.257,4.45,7.617,8.826,13.219,12.133c5.593,3.307,12.469,5.487,20.416,5.47 c5.256,0,10.964-0.937,17.117-3.026l0.008,0.313c0,2.196-0.345,4.194-0.683,5.61c-0.164,0.691-0.337,1.258-0.46,1.612 c-0.058,0.181-0.099,0.313-0.132,0.395l-0.024,0.066v0.008c-0.904,2.294,0.197,4.886,2.492,5.807 c2.303,0.913,4.911-0.205,5.832-2.492c0.123-0.321,1.908-4.804,1.933-11.005c0-3.554-0.617-7.732-2.698-11.853 C343.401,159.984,339.855,156.028,334.558,153.042z"/><path d="M219.572,119.564c3.086-3.636,7.47-6.498,12.462-8.415c4.993-1.942,10.554-2.904,15.769-2.904 c5.067,0,9.797,0.929,13.252,2.55c2.262,1.036,4.918,0.05,5.946-2.188c1.037-2.246,0.058-4.919-2.18-5.938 c-5.001-2.32-10.891-3.356-17.019-3.365c-6.3,0-12.864,1.127-18.993,3.48c-6.103,2.352-11.779,5.947-16.056,11.006 c-1.612,1.883-1.374,4.705,0.51,6.3C215.155,121.702,217.993,121.456,219.572,119.564z"/><path d="M288.782,0.457C178.362-6.338,85.38,63.128,87.485,176.304l-0.082,10.242l-47.972,84.716 c-2.583,4.565-2.814,10.101-0.625,14.872c2.188,4.771,6.531,8.201,11.68,9.221l29.646,8.176l9.311,89.824 c0.247,8.661,4.097,16.822,10.628,22.506c6.531,5.692,15.152,8.382,23.756,7.419l23.673,1.884c4.622-0.51,9.246,0.962,12.708,4.072 c3.463,3.093,5.446,7.526,5.446,12.174V512h200.302c0,0,0-34.226,0-47.881c0-13.663,4.721-44.887,13.654-59.184 c32.475-51.92,85.333-79.542,94.25-186.014C482.784,112.432,419.233,8.494,288.782,0.457z M422.046,183.049 c-4.491,7.42-11.754,12.042-19.684,13.408c-2.434,0.428-4.08,2.731-3.668,5.174c0.436,2.434,2.747,4.088,5.182,3.652 c1.818-0.313,3.611-0.765,5.38-1.333c1.908,3.956,2.862,8.209,2.862,12.445c0,4.524-1.077,9.015-3.142,13.078 c-2.057,4.056-5.1,7.667-9.098,10.48c-5.026,3.528-10.743,5.206-16.418,5.215c-0.452,0-0.897-0.049-1.341-0.058 c-0.099-0.749-0.19-1.489-0.321-2.221v-0.009c-0.978-5.19-3.01-9.944-5.782-14.074l-0.338-0.501l-0.46-0.395 c-3.389-2.912-7.889-7.683-11.36-12.544c-1.752-2.426-3.24-4.886-4.244-7.074c-1.012-2.196-1.481-4.105-1.464-5.232 c0-0.502,0.074-0.848,0.173-1.078c0.082-0.222,0.164-0.354,0.337-0.535c1.744-1.736,1.744-4.582,0-6.342 c-1.752-1.736-4.581-1.736-6.325,0c-1.103,1.086-1.926,2.401-2.427,3.792c-0.518,1.366-0.708,2.788-0.708,4.162 c0.016,3.101,0.954,6.046,2.27,8.958c1.999,4.352,4.976,8.67,8.209,12.618c3.036,3.702,6.252,7.033,9.148,9.583 c1.999,3.052,3.454,6.507,4.17,10.315c0.296,1.605,0.452,3.2,0.485,4.722v0.033c0,0.197,0.008,0.395,0.008,0.608 c0,6.762-2.41,13.17-6.548,18.212c-4.145,5.034-9.977,8.694-16.895,9.994c-1.802,0.345-3.595,0.51-5.356,0.51 c-9.5,0.008-18.286-4.771-23.566-12.355c2.846-2.887,5.273-6.268,7.115-10.11v0.008c2.295-4.746,3.504-9.78,3.718-14.764 c0.107-2.468-1.801-4.557-4.269-4.664c-2.484-0.115-4.566,1.809-4.681,4.277c-0.156,3.8-1.077,7.608-2.829,11.244l-0.008,0.017 c-1.884,3.89-4.5,7.148-7.626,9.723l-0.016,0.008c-5.149,4.203-11.64,6.523-18.277,6.523c-4.178,0-8.423-0.913-12.454-2.863 c-7.46-3.586-12.642-9.977-14.937-17.29h-0.008c-0.872-2.772-1.324-5.692-1.324-8.62c0-4.187,0.913-8.432,2.862-12.47 c1.078-2.229,0.132-4.91-2.097-5.972c-2.221-1.077-4.894-0.148-5.972,2.082c-2.533,5.264-3.759,10.866-3.759,16.361 c0,2.665,0.313,5.297,0.856,7.871c-3.496,1.909-7.436,3.134-11.697,3.438h-0.008c-0.699,0.05-1.382,0.082-2.073,0.082 c-6.729,0-12.955-2.336-17.891-6.293c-4.318-3.454-7.624-8.102-9.385-13.515c3.142-3.1,5.758-6.744,7.674-10.783 c1.053-2.238,0.098-4.903-2.138-5.956c-2.229-1.061-4.919-0.107-5.964,2.138c-1.769,3.752-4.352,7.083-7.502,9.74 c-4.491,3.792-10.151,6.227-16.451,6.68h-0.008c-0.699,0.049-1.382,0.082-2.064,0.082c-14.214,0-26.355-10.504-28.412-24.553 l-0.008-0.041v-0.024c-0.115-0.675-0.189-1.374-0.238-2.098c-0.049-0.683-0.074-1.39-0.074-2.081c0-1.802,0.173-3.586,0.494-5.306 c0.436-2.435-1.167-4.771-3.602-5.223c-2.418-0.436-4.762,1.152-5.223,3.586c-0.404,2.253-0.625,4.573-0.625,6.942l0.008,0.271 c-4.03-0.452-7.938-1.744-11.434-3.792c-4.426-2.582-8.185-6.366-10.784-11.22c-2.311-4.335-3.406-8.949-3.406-13.523 c0-5.906,1.835-11.704,5.216-16.55c1.308,1.842,2.78,3.578,4.433,5.206c3.784,3.71,8.16,6.457,12.791,8.25 c2.311,0.906,4.895-0.247,5.791-2.566c0.905-2.303-0.255-4.894-2.55-5.791c-3.545-1.366-6.869-3.454-9.748-6.284v-0.008 c-2.55-2.484-4.524-5.314-5.931-8.349c-1.809-3.85-2.714-8.036-2.714-12.19c0.007-7.288,2.722-14.51,8.2-20.103 c4.664-4.755,10.537-7.536,16.632-8.382h0.008h0.016c1.3-0.165,2.599-0.255,3.899-0.255c7.272,0.008,14.502,2.748,20.112,8.218 c1.769,1.719,4.598,1.702,6.334-0.074c1.728-1.76,1.695-4.59-0.066-6.326c-7.14-6.992-16.385-10.57-25.64-10.734 c1.044-4.286,3.052-8.274,5.865-11.631c3.907-4.655,9.246-8.094,15.629-9.566c2.172-0.485,4.31-0.732,6.44-0.732 c3.751,0,7.403,0.756,10.776,2.122c-0.954,3.34-1.481,6.844-1.481,10.48c0,2.467,2,4.466,4.475,4.466 c2.475,0,4.474-1.999,4.474-4.466c0-3.916,0.799-7.658,2.197-11.055c2.163-5.199,5.824-9.624,10.422-12.75 c4.614-3.126,10.134-4.943,16.13-4.943c8.637,0,16.345,3.775,21.625,9.804c4.45,5.059,7.124,11.672,7.124,18.944 c0,2.467,2.016,4.466,4.483,4.466c2.476,0,4.491-1.999,4.491-4.466c0-8.276-2.681-15.95-7.214-22.16 c2.32-3.208,5.273-5.939,8.694-7.962c4.277-2.517,9.254-3.973,14.593-3.973c6.152,0,11.803,1.917,16.467,5.19 c4.681,3.274,8.333,7.914,10.398,13.301h-0.008c1.218,3.2,1.884,6.638,1.884,10.266c0,2.468,2.015,4.474,4.483,4.474 c2.468,0,4.491-2.006,4.491-4.474c0-3.702-0.568-7.263-1.563-10.644c5.314-4.935,12.347-7.732,19.61-7.732 c3.792,0,7.642,0.749,11.359,2.336c5.182,2.246,9.345,5.791,12.314,10.118c2.97,4.335,4.713,9.418,5.018,14.682 c0.033,0.543,0.058,1.078,0.058,1.62c-0.017,3.801-0.766,7.634-2.361,11.36c-0.978,2.271,0.074,4.903,2.344,5.873 c2.278,0.979,4.902-0.066,5.889-2.336c1.662-3.866,2.616-7.856,2.937-11.861c4.392,0.312,8.669,1.645,12.454,3.882 c4.318,2.55,8.011,6.284,10.529,11.071c2.204,4.187,3.24,8.637,3.249,13.046c0,2.015-0.247,4.014-0.682,5.972 c-2.682-1.053-5.478-1.76-8.267-2.172c-2.435-0.337-4.714,1.374-5.042,3.825c-0.354,2.452,1.357,4.713,3.792,5.051 c2.821,0.402,5.593,1.209,8.242,2.459c0.461,0.766,1.168,1.399,2.056,1.786c0.543,0.238,1.127,0.354,1.695,0.354 c1.653,1.102,3.158,2.344,4.5,3.701l0.008,0.008c5.379,5.42,8.266,12.733,8.266,20.21 C426.233,173.252,424.892,178.385,422.046,183.049z"/><path d="M375.522,143.452c-2.221-1.917-4.606-3.488-7.132-4.59c-2.534-1.119-5.199-1.785-7.921-1.785 c-2.476,0-4.475,2.007-4.475,4.483c0,2.476,1.999,4.475,4.475,4.475c1.645,0,3.718,0.568,5.922,1.835 c3.282,1.883,6.696,5.272,9.164,9.5c2.501,4.236,4.096,9.262,4.08,14.469c-0.017,5.717-1.818,11.689-6.704,17.619 c-1.563,1.9-1.3,4.73,0.608,6.301c1.909,1.588,4.738,1.308,6.31-0.584c6.144-7.428,8.768-15.653,8.76-23.336 c0-4.672-0.954-9.147-2.517-13.227C383.723,152.5,379.956,147.284,375.522,143.452z"/><path d="M344.545,123.142c-12.314,0-22.193-4.54-29.037-10.471c-3.422-2.962-6.038-6.268-7.757-9.443 c-1.744-3.167-2.534-6.186-2.517-8.448c0-2.467-2.007-4.474-4.475-4.474c-2.476,0-4.483,2.007-4.483,4.474 c0.016,4.204,1.333,8.53,3.603,12.726c2.394,4.376,5.882,8.628,10.299,12.362c-0.889,1.234-2.114,2.846-3.694,4.549 c-3.406,3.726-8.324,7.847-14.206,9.945c-2.311,0.822-3.537,3.38-2.706,5.716c0.83,2.336,3.381,3.537,5.725,2.714 c7.971-2.862,13.926-8.085,17.981-12.536c1.802-1.974,3.2-3.791,4.245-5.239c7.403,4.269,16.558,7.091,27.021,7.091 c2.476,0,4.474-2.007,4.474-4.475C349.019,125.158,347.02,123.142,344.545,123.142z"/></svg>`,
  fascist: `<svg width="28" height="28" viewBox="0 0 512 512" fill="#ffffff"><path d="M16.466,474.754c-3.402,4.839-4.724,10.753-3.701,16.617c1.023,5.866,4.269,10.981,9.141,14.406 c10.054,7.067,23.985,4.638,31.054-5.418l81.419-113.879l-37.115-24.743L16.466,474.754z"/><path d="M380.491,37.29c7.067-10.055,4.637-23.986-5.418-31.053c-4.87-3.424-10.78-4.746-16.648-3.723 c-5.866,1.024-10.981,4.27-14.404,9.14l-18.627,27.34c12.817,7.766,25.881,15.031,39.178,21.784L380.491,37.29z"/><polygon points="108.789,345.473 145.905,370.217 182.939,317.965 145.82,293.219"/><path d="M475.354,124.398c-5.536,20.532-14.844,46.991-30.006,71.249 c-20.207,32.324-51.227,51.038-71.123,60.375c6.488,9.106,12.754,18.402,18.78,27.898c15.111-5.964,51.096-23.048,72.341-57.041 c22.617-36.187,31.362-78.549,34.226-96.499C491.441,128.545,483.371,126.544,475.354,124.398z"/><path d="M428.453,185.085c13.983-22.372,22.595-47.007,27.733-66.144 c-60.251-18.217-117.023-45.376-169.41-81.092l-53.532,76.156c49.191,35.64,92.351,77.73,128.9,125.63 C379.433,232.029,409.576,215.281,428.453,185.085z"/><path d="M157.345,276.956l37.121,24.747l86.669-122.282c-10.86-10.227-22.12-20.06-33.771-29.491 L157.345,276.956z"/></svg>`,
  hitler: `<svg width="28" height="28" viewBox="0 0 512 512" fill="#ffffff"><rect x="41.959" y="263.078" width="428.078" height="20.969"/><path d="M256.006,378.688c77.703,0,176.594-22.938,214.031-71.766H41.959 C79.412,355.75,178.287,378.688,256.006,378.688z"/><polygon points="278.943,448.188 233.068,448.188 217.787,448.188 213.959,504.078 233.068,504.078 278.943,504.078 298.037,504.078 294.225,448.188"/><path d="M485.318,129.484C439.459,102.984,355.381,7.922,256.006,7.922S72.537,102.984,26.678,129.484 c-57.453,33.188-7.641,79.5,15.281,100.109h428.078C492.975,208.984,542.771,162.672,485.318,129.484z M296.678,152.359h-35.547 v22.563h-10.25v-22.563h-35.547l-24.609-36.922h56.047l-1.484-6.484l-8.766-3.766V86.734h14.359h10.25h4.109v18.453v10.25h56.047 L296.678,152.359z"/></svg>`,
};

let myId = null;
let players = [];
let phase = "lobby";
let flipped = false;
let seen = false;
let myRole = null; // { role, teammates, hidden }

function isHost() {
  return players.find((p) => p.id === myId)?.isHost ?? false;
}

function showView(view) {
  lobbyView.hidden = view !== "lobby";
  roleView.hidden = view !== "role";
  tableView.hidden = view !== "table";
  boardView.hidden = view !== "board";
  nominateView.hidden = view !== "nominate";
  voteView.hidden = view !== "vote";
  voteRevealView.hidden = view !== "vote-reveal";
}

function renderPlayerList() {
  lobbyPlayerListEl.innerHTML = "";
  for (const p of players) {
    const li = document.createElement("li");
    li.className = "lobby-player-row";

    const avatar = document.createElement("span");
    avatar.className = "lobby-avatar";
    avatar.textContent = p.name.trim().charAt(0) || "?";

    const nameEl = document.createElement("span");
    nameEl.className = "lobby-player-name";
    nameEl.textContent = p.name + (p.id === myId ? " (you)" : "");

    li.append(avatar, nameEl);

    if (p.isHost) {
      const badge = document.createElement("span");
      badge.className = "lobby-host-badge";
      badge.textContent = "HOST";
      li.append(badge);
    } else if (p.ready) {
      const tag = document.createElement("span");
      tag.className = "lobby-ready-tag";
      tag.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#067bc2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      tag.append("Ready");
      li.append(tag);
    }

    lobbyPlayerListEl.appendChild(li);
  }
}

function renderLobby() {
  renderPlayerList();

  const amHost = isHost();
  const count = players.length;
  const inRange = count >= MIN_PLAYERS && count <= MAX_PLAYERS;

  dealBtn.hidden = !amHost;
  dealBtn.disabled = !inRange;
  readyToggleBtn.hidden = amHost;
  lobbyWaitingEl.hidden = amHost;

  if (amHost) {
    lobbyHintEl.hidden = inRange;
    if (!inRange) {
      lobbyHintEl.textContent =
        count < MIN_PLAYERS
          ? `Need at least ${MIN_PLAYERS} players (${count} so far).`
          : `Too many players for one game — ${MAX_PLAYERS} max (${count} joined).`;
    }
  } else {
    lobbyHintEl.hidden = true;
    const host = players.find((p) => p.isHost);
    lobbyWaitingEl.textContent = `Waiting for ${host?.name ?? "the host"} to deal`;
    const me = players.find((p) => p.id === myId);
    readyToggleBtn.textContent = me?.ready ? "Not ready" : "Ready up";
    readyToggleBtn.classList.toggle("is-ready", Boolean(me?.ready));
  }
}

const READY_CHECK_SVG =
  '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

function renderReadyStrip() {
  readyStripEl.innerHTML = "";
  for (const p of players) {
    const item = document.createElement("div");
    item.className =
      "sh-ready-item" + (p.ready ? " is-ready" : "") + (p.id === myId ? " is-me" : "");

    const avatar = document.createElement("div");
    avatar.className = "sh-ready-avatar";
    avatar.textContent = p.name.trim().charAt(0) || "?";
    if (p.ready) {
      const badge = document.createElement("span");
      badge.className = "sh-ready-badge";
      badge.innerHTML = READY_CHECK_SVG;
      avatar.appendChild(badge);
    }

    const name = document.createElement("span");
    name.className = "sh-ready-name";
    name.textContent = p.name;

    item.append(avatar, name);
    readyStripEl.appendChild(item);
  }

  const readyCount = players.filter((p) => p.ready).length;
  readyCountEl.textContent = `${readyCount} of ${players.length} ready`;
}

function updateReadyButton() {
  const iAmReady = players.find((p) => p.id === myId)?.ready ?? false;
  readyBtn.disabled = !seen || iAmReady;
  readyBtn.textContent = iAmReady ? "Waiting…" : "Ready";
}

function renderRoleCard() {
  if (!myRole) return;
  roleCard.classList.toggle("is-revealed", flipped);
  updateReadyButton();

  const backEl = roleCard.querySelector(".sh-card-back");
  backEl.className = "sh-card-face sh-card-back role-" + myRole.role;
  roleIcon.innerHTML = ICONS[myRole.role];
  roleTeam.innerHTML = "";

  if (myRole.role === "liberal") {
    roleName.textContent = "Liberal";
    roleDesc.textContent = "You don't know anyone else's role. Watch how people vote and argue for policies you trust.";
  } else if (myRole.role === "fascist") {
    roleName.textContent = "Fascist";
    roleDesc.textContent = "Help your team seize power without getting caught. Here's who you're working with:";
    myRole.teammates.forEach(({ name, role }) => {
      const chip = document.createElement("span");
      chip.className = "sh-team-chip" + (role === "hitler" ? " is-hitler" : "");
      chip.textContent = role === "hitler" ? `${name} — Hitler` : name;
      roleTeam.appendChild(chip);
    });
  } else {
    roleName.textContent = "Hitler";
    roleDesc.textContent =
      "You lead the fascists. If three fascist policies pass and you're then elected Chancellor, your side wins on the spot — so staying likable matters more than staying loyal-looking.";
    if (myRole.hidden) {
      const note = document.createElement("p");
      note.className = "sh-team-note";
      note.textContent = "This game has enough players that you're kept in the dark on who your fascists are, same as the liberals.";
      roleTeam.appendChild(note);
    } else {
      myRole.teammates.forEach(({ name }) => {
        const chip = document.createElement("span");
        chip.className = "sh-team-chip";
        chip.textContent = name;
        roleTeam.appendChild(chip);
      });
    }
  }

  renderReadyStrip();
}

roleCard.addEventListener("click", () => {
  flipped = !flipped;
  if (flipped) seen = true;
  renderRoleCard();
});

readyBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  socket?.send(JSON.stringify({ type: "ready" }));
});

dealBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "deal" }));
});

readyToggleBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "ready" }));
});

dealAgainBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "reset" }));
});

function renderTable() {
  const amHost = isHost();
  dealAgainBtn.hidden = !amHost;
  tableWaitingEl.hidden = amHost;
}

// --- Board / nomination / voting mockup ---------------------------------
// Everything below runs locally on this one device only (see the banner on
// the board view) — nominating, voting, and the board state itself aren't
// sent over the socket yet. A "viewing as" picker stands in for "each
// player looks at their own phone" while this is still a UI mockup, same
// pattern the role reveal started from before it got wired up for real.

let board = null;

function initBoard() {
  board = {
    liberalPolicies: 0,
    fascistPolicies: 0,
    tracker: 0,
    round: 1,
    presidentIdx: 0,
    chancellorId: null,
    lastPresidentId: null,
    lastChancellorId: null,
    votes: {},
    viewerId: players[0]?.id ?? null,
    pendingOutcome: false,
  };
}

function currentPresident() {
  if (!board || players.length === 0) return null;
  return players[board.presidentIdx % players.length];
}

// The previous Chancellor is always term-limited out of the next
// nomination; the previous President is too, but only once the table's
// big enough that skipping them doesn't stall the rotation (mirrors the
// real game's 5-6 vs 7+ player distinction).
function eligibleNominees() {
  const president = currentPresident();
  return players.filter((p) => {
    if (p.id === president?.id) return false;
    if (p.id === board.lastChancellorId) return false;
    if (players.length > 6 && p.id === board.lastPresidentId) return false;
    return true;
  });
}

function renderTrackSlots(container, total, filled) {
  container.innerHTML = "";
  for (let i = 0; i < total; i++) {
    const slot = document.createElement("span");
    slot.className = "sh-track-slot" + (i < filled ? " is-filled" : "");
    container.appendChild(slot);
  }
}

function populateViewerSelect(selectEl) {
  if (selectEl.options.length !== players.length) {
    selectEl.innerHTML = "";
    for (const p of players) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      selectEl.appendChild(opt);
    }
  }
}

function renderBoard() {
  if (!board) return;
  renderTrackSlots(boardLiberalTrackEl, 5, board.liberalPolicies);
  renderTrackSlots(boardFascistTrackEl, 6, board.fascistPolicies);
  renderTrackSlots(boardTrackerEl, 3, board.tracker);

  const president = currentPresident();
  boardPresidentNameEl.textContent = president ? president.name : "—";
  const chancellor = players.find((p) => p.id === board.chancellorId);
  boardChancellorNameEl.textContent = chancellor ? chancellor.name : "—";

  populateViewerSelect(boardViewerSelect);
  boardViewerSelect.value = board.viewerId;

  const viewingPresident = board.viewerId === president?.id;
  nominateCtaBtn.hidden = !viewingPresident;
  boardWaitingTextEl.hidden = viewingPresident;
  if (!viewingPresident) {
    boardWaitingTextEl.textContent = `Waiting for ${president?.name ?? "the President"} to nominate a Chancellor…`;
  }
}

boardLibMinusBtn.addEventListener("click", () => {
  board.liberalPolicies = Math.max(0, board.liberalPolicies - 1);
  renderBoard();
});
boardLibPlusBtn.addEventListener("click", () => {
  board.liberalPolicies = Math.min(5, board.liberalPolicies + 1);
  renderBoard();
});
boardFasMinusBtn.addEventListener("click", () => {
  board.fascistPolicies = Math.max(0, board.fascistPolicies - 1);
  renderBoard();
});
boardFasPlusBtn.addEventListener("click", () => {
  board.fascistPolicies = Math.min(6, board.fascistPolicies + 1);
  renderBoard();
});
boardViewerSelect.addEventListener("change", () => {
  board.viewerId = boardViewerSelect.value;
  renderBoard();
});

continueBoardBtn.addEventListener("click", () => {
  if (!board) initBoard();
  showView("board");
  renderBoard();
});

nominateCtaBtn.addEventListener("click", () => {
  showView("nominate");
  renderNominate();
});

function renderNominate() {
  const president = currentPresident();
  nominatePresidentNameEl.textContent = president ? president.name : "—";
  nominateConfirmBtn.disabled = true;
  delete nominateConfirmBtn.dataset.nomineeId;

  nomineeListEl.innerHTML = "";
  const eligible = eligibleNominees();
  for (const p of players) {
    if (p.id === president?.id) continue;
    const isEligible = eligible.some((e) => e.id === p.id);

    const li = document.createElement("li");
    const rowBtn = document.createElement("button");
    rowBtn.type = "button";
    rowBtn.className = "sh-nominee-row" + (isEligible ? "" : " is-ineligible");
    rowBtn.disabled = !isEligible;

    const nameSpan = document.createElement("span");
    nameSpan.className = "sh-nominee-name";
    nameSpan.textContent = p.name;
    rowBtn.appendChild(nameSpan);

    if (!isEligible) {
      const note = document.createElement("span");
      note.className = "sh-nominee-note";
      note.textContent = "term-limited";
      rowBtn.appendChild(note);
    }

    rowBtn.addEventListener("click", () => {
      for (const row of nomineeListEl.querySelectorAll(".sh-nominee-row")) row.classList.remove("is-selected");
      rowBtn.classList.add("is-selected");
      nominateConfirmBtn.disabled = false;
      nominateConfirmBtn.dataset.nomineeId = p.id;
    });

    li.appendChild(rowBtn);
    nomineeListEl.appendChild(li);
  }
}

nominateConfirmBtn.addEventListener("click", () => {
  const nomineeId = nominateConfirmBtn.dataset.nomineeId;
  if (!nomineeId) return;
  board.chancellorId = nomineeId;
  board.votes = {};
  showView("vote");
  renderVote();
});

function renderVote() {
  const president = currentPresident();
  const chancellor = players.find((p) => p.id === board.chancellorId);
  votePresidentNameEl.textContent = president ? president.name : "—";
  voteChancellorNameEl.textContent = chancellor ? chancellor.name : "—";

  populateViewerSelect(voteViewerSelect);
  voteViewerSelect.value = board.viewerId;

  const myVote = board.votes[board.viewerId];
  voteJaBtn.classList.toggle("is-picked", myVote === "ja");
  voteNeinBtn.classList.toggle("is-picked", myVote === "nein");

  const votedCount = Object.keys(board.votes).length;
  const allVoted = votedCount === players.length;
  voteStatusTextEl.textContent = allVoted ? "Everyone's voted." : `${votedCount} of ${players.length} voted.`;
  voteRevealBtn.hidden = !allVoted;
}

voteViewerSelect.addEventListener("change", () => {
  board.viewerId = voteViewerSelect.value;
  renderVote();
});

// After voting, jump to the next player who hasn't voted yet — keeps a
// "pass the device around the table" flow moving without extra taps.
function advanceVoteViewer() {
  const next = players.find((p) => !board.votes[p.id]);
  if (next) board.viewerId = next.id;
}

voteJaBtn.addEventListener("click", () => {
  board.votes[board.viewerId] = "ja";
  advanceVoteViewer();
  renderVote();
});
voteNeinBtn.addEventListener("click", () => {
  board.votes[board.viewerId] = "nein";
  advanceVoteViewer();
  renderVote();
});

voteRevealBtn.addEventListener("click", () => {
  showView("vote-reveal");
  renderVoteReveal();
});

function renderVoteReveal() {
  const jaCount = Object.values(board.votes).filter((v) => v === "ja").length;
  const neinCount = Object.values(board.votes).filter((v) => v === "nein").length;
  const passed = jaCount > neinCount;
  board.pendingOutcome = passed;

  voteOutcomeBannerEl.className = "sh-outcome-banner " + (passed ? "is-pass" : "is-fail");
  voteOutcomeBannerEl.innerHTML = passed
    ? `Government approved!<p>${jaCount} Ja · ${neinCount} Nein — draw and resolve the legislative session at the table.</p>`
    : `Government rejected.<p>${jaCount} Ja · ${neinCount} Nein — the election tracker moves up${
        board.tracker >= 2 ? " (one more fail and the top policy auto-enacts)" : ""
      }.</p>`;

  voteTallyListEl.innerHTML = "";
  for (const p of players) {
    const li = document.createElement("li");
    li.className = "sh-vote-tally-row";
    const name = document.createElement("span");
    name.className = "sh-vote-tally-name";
    name.textContent = p.name;
    const badge = document.createElement("span");
    const vote = board.votes[p.id];
    badge.className = "sh-vote-tally-badge is-" + vote;
    badge.textContent = vote === "ja" ? "Ja" : "Nein";
    li.append(name, badge);
    voteTallyListEl.appendChild(li);
  }
}

voteContinueBtn.addEventListener("click", () => {
  const president = currentPresident();
  if (board.pendingOutcome) {
    board.lastPresidentId = president?.id ?? null;
    board.lastChancellorId = board.chancellorId;
    board.tracker = 0;
  } else {
    board.tracker += 1;
    // Chaos: three failed elections in a row auto-enacts the top policy at
    // the table (not modeled here since there's no real policy deck yet)
    // and resets the tracker.
    if (board.tracker >= 3) board.tracker = 0;
  }
  board.chancellorId = null;
  board.votes = {};
  board.presidentIdx = (board.presidentIdx + 1) % Math.max(1, players.length);
  board.round += 1;
  showView("board");
  renderBoard();
});

// Mobile: Preview / How to play tabs live in one card (desktop shows
// both panes at once and hides the tabs — see the min-width:721px rule in
// lobby.css — so this listener is a no-op there, which is fine).
const lobbyIntroTabs = el("lobby-intro-tabs");
lobbyIntroTabs?.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-pane]");
  if (!btn) return;
  for (const b of lobbyIntroTabs.querySelectorAll("button")) b.classList.toggle("is-active", b === btn);
  for (const pane of document.querySelectorAll(".lobby-intro-pane")) {
    pane.classList.toggle("is-active", pane.dataset.pane === btn.dataset.pane);
  }
});

backBtn.addEventListener("click", () => (location.href = "/"));
roleBackBtn.addEventListener("click", () => (location.href = "/"));
tableBackBtn.addEventListener("click", () => (location.href = "/"));
boardBackBtn.addEventListener("click", () => (location.href = "/"));
nominateBackBtn.addEventListener("click", () => (location.href = "/"));
voteBackBtn.addEventListener("click", () => (location.href = "/"));
voteRevealBackBtn.addEventListener("click", () => (location.href = "/"));

copyCodeBtn.addEventListener("click", async () => {
  if (!room) return;
  try {
    await navigator.clipboard.writeText(room);
    const original = copyCodeBtn.innerHTML;
    copyCodeBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#067bc2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    setTimeout(() => (copyCodeBtn.innerHTML = original), 1200);
  } catch {
    // Clipboard access can fail (permissions, insecure context); the code
    // is already visible on screen, so this is a nice-to-have only.
  }
});

let socket;

if (!room) {
  console.warn("Secret Hitler loaded without a room code.");
} else {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const connectParams = new URLSearchParams();
  if (isHostUrl) connectParams.set("host", "1");
  if (playerName) connectParams.set("name", playerName);
  const query = connectParams.toString();
  socket = new WebSocket(
    `${protocol}//${location.host}/parties/secret-hitler/${room}${query ? `?${query}` : ""}`
  );

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case "you":
        myId = data.id;
        renderLobby();
        break;
      case "players":
        players = data.players;
        phase = data.phase;
        if (phase === "lobby") {
          flipped = false;
          seen = false;
          myRole = null;
          showView("lobby");
          renderLobby();
        } else if (phase === "table") {
          renderTable();
        } else if (phase === "reveal") {
          renderReadyStrip();
          updateReadyButton();
        }
        break;
      case "role":
        myRole = { role: data.role, teammates: data.teammates, hidden: data.hidden };
        flipped = false;
        seen = false;
        board = null;
        showView("role");
        renderRoleCard();
        break;
      case "table":
        showView("table");
        renderTable();
        break;
      case "lobby":
        flipped = false;
        seen = false;
        myRole = null;
        board = null;
        showView("lobby");
        renderLobby();
        break;
    }
  });
}
