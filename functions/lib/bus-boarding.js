"use strict";

function notImplemented(name) {
  throw new Error(`not implemented: ${name}`);
}

function rideTypeToLegRequired(rideType) {
  notImplemented("rideTypeToLegRequired");
}

function parseRideTypeLabel(label) {
  notImplemented("parseRideTypeLabel");
}

function mergeRosterImport(existing, rows, options) {
  notImplemented("mergeRosterImport");
}

function toPublicRoster(roster) {
  notImplemented("toPublicRoster");
}

function findRosterIndexByNickname(roster, nickname) {
  notImplemented("findRosterIndexByNickname");
}

function applySelfBoard(row, leg, isoNow) {
  notImplemented("applySelfBoard");
}

function applyAdminBoard(row, leg, boarded, isoNow) {
  notImplemented("applyAdminBoard");
}

function emptyBusBoarding(options) {
  notImplemented("emptyBusBoarding");
}

module.exports = {
  rideTypeToLegRequired,
  parseRideTypeLabel,
  mergeRosterImport,
  toPublicRoster,
  findRosterIndexByNickname,
  applySelfBoard,
  applyAdminBoard,
  emptyBusBoarding,
};
