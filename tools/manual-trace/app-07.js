/**
 * AI-CODING NOTE:
 * Responsibility: Top-bar menu coordination, chunk 8 of 8.
 * Dependency: Loads after the core Manual Trace scripts.
 * Safe edits: Preserve native <details> behavior inside each menu.
 */
"use strict";

document.querySelectorAll("#bar details.menu").forEach(menu=>{
 menu.addEventListener("toggle",()=>{
  if(!menu.open)return;
  document.querySelectorAll("#bar details.menu[open]").forEach(other=>{
   if(other!==menu)other.open=false
  })
 })
});
