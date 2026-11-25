/*
 * Names for the sky labels. SKY_STAR_NAMES: proper names of the stars of magnitude 2.2 or brighter, keyed by their
 * position in SKY_STARS (sky-data.js). SKY_CONSTELLATIONS: the better known constellations, most prominent first, as
 * [name, right ascension, declination (degrees, J2000) of a place to write it]. Taken from data/starnames.json and
 * data/constellations.json in d3-celestial (https://github.com/ofrohn/d3-celestial).
 *
 * Copyright (c) 2015, Olaf Frohn
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
window.SKY_STAR_NAMES = {
  0: "Sirius", 1: "Canopus", 2: "Arcturus", 3: "Rigil Kentaurus", 4: "Vega", 5: "Capella",
  6: "Rigel", 7: "Procyon", 8: "Achernar", 9: "Betelgeuse", 10: "Hadar", 11: "Altair",
  12: "Acrux", 13: "Aldebaran", 14: "Spica", 15: "Antares", 16: "Pollux", 17: "Fomalhaut",
  18: "Mimosa", 19: "Deneb", 20: "Toliman", 21: "Regulus", 22: "Adhara", 23: "Castor",
  24: "Gacrux", 25: "Shaula", 26: "Bellatrix", 27: "Elnath", 28: "Miaplacidus", 29: "Alnilam",
  30: "Alnair", 31: "Alnitak", 32: "Regor", 33: "Alioth", 34: "Mirfak", 35: "Kaus Australis",
  36: "Dubhe", 37: "Wezen", 38: "Alkaid", 39: "Avior", 40: "Sargas", 41: "Menkalinan",
  42: "Atria", 43: "Alhena", 44: "Alsephina", 45: "Peacock", 46: "Polaris", 47: "Mirzam",
  48: "Alphard", 49: "Hamal", 50: "Algieba", 51: "Diphda", 52: "Nunki", 53: "Menkent",
  54: "Alpheratz", 55: "Mirach", 56: "Saiph", 57: "Kochab", 58: "Tiaki", 59: "Rasalhague",
  60: "Algol", 61: "Almach", 62: "Denebola", 63: "Navi", 64: "Muhlifain"
};
window.SKY_CONSTELLATIONS = [
  ["Andromeda", 0.8, 43.0], ["Aquila", 291.0, 8.0], ["Aries", 42.0, 22.0], ["Auriga", 82.5, 37.0],
  ["Bo\u00f6tes", 223.5, 35.0], ["Canis Major", 97.5, -26.0], ["Carina", 144.0, -66.0], ["Cassiopeia", 354.0, 55.5],
  ["Centaurus", 199.5, -40.0], ["Cetus", 28.5, -5.0], ["Cygnus", 307.5, 50.0], ["Eridanus", 52.5, -18.0],
  ["Gemini", 107.2, 23.5], ["Leo", 159.0, 15.0], ["Orion", 84.0, 13.0], ["Pegasus", 334.5, 16.0],
  ["Perseus", 66.0, 45.0], ["Sagittarius", 292.5, -34.0], ["Scorpius", 249.0, -38.0], ["Taurus", 54.0, 15.0],
  ["Ursa Major", 165.0, 48.0], ["Virgo", 199.5, -4.0], ["Aquarius", 337.5, -5.0], ["Camelopardalis", 84.0, 72.0],
  ["Cancer", 128.2, 27.0], ["Canes Venatici", 192.0, 43.0], ["Canis Minor", 109.5, 5.0], ["Capricornus", 315.0, -22.0],
  ["Cepheus", 337.5, 71.0], ["Corona Borealis", 238.5, 32.0], ["Crux", 193.5, -62.0], ["Draco", 268.5, 64.0],
  ["Hercules", 253.5, 35.0], ["Hydra", 150.0, -22.0], ["Libra", 231.0, -26.0], ["Lyra", 279.0, 30.0],
  ["Monoceros", 114.8, -6.0], ["Ophiuchus", 258.0, 3.0], ["Pavo", 297.0, -62.0], ["Phoenix", 16.5, -43.0],
  ["Pisces", 19.5, 15.0], ["Piscis Austrinus", 333.0, -29.0], ["Puppis", 111.0, -46.0], ["Triangulum Australe", 240.0, -67.5],
  ["Ursa Minor", 226.5, 68.0], ["Vela", 143.2, -46.0]
];
