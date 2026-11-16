import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const page = location.pathname.split("/").pop() || "index.html";
const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE_") && firebaseConfig.projectId !== "YOUR_PROJECT_ID";
let auth, db, functions, currentUser = null, profile = null, unsubscribers = [];
const cleanup = () => { unsubscribers.forEach(fn => fn()); unsubscribers = []; };
const say = (el, message, type="") => { if (!el) return; el.textContent = message; el.className = `notice ${type}`; };
const callable = (name) => httpsCallable(functions, name);
const money = n => `R ${Number(n || 0).toFixed(2)}`;
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateText = ts => ts?.toDate ? ts.toDate().toLocaleString() : "Just now";

if (!configured) {
  document.querySelectorAll(".notice").forEach(el => say(el, "Firebase is not configured yet. Follow SETUP.md to connect your Firebase project.", "error"));
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app); db = getFirestore(app); functions = getFunctions(app);
  if (page === "passenger.html") initPassenger();
  if (page === "driver.html") initDriver();
  if (page === "admin.html") initAdmin();
}

function wireTabs() {
  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === btn));
    $("login-form")?.classList.toggle("hidden", btn.dataset.tab !== "login");
    $("signup-form")?.classList.toggle("hidden", btn.dataset.tab !== "signup");
  }));
}
function wireAuth(role) {
  wireTabs();
  $("login-form")?.addEventListener("submit", async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try { await signInWithEmailAndPassword(auth, f.get("email"), f.get("password")); say($("auth-message"), "Welcome back.", "success"); }
    catch(err) { say($("auth-message"), friendly(err), "error"); }
  });
  $("signup-form")?.addEventListener("submit", async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try {
      const cred = await createUserWithEmailAndPassword(auth, f.get("email"), f.get("password"));
      await updateProfile(cred.user, {displayName:f.get("name")});
      const data = {uid:cred.user.uid, name:f.get("name"), phone:f.get("phone"), email:f.get("email"), role, createdAt:new Date().toISOString()};
      if (role === "driver") Object.assign(data,{vehicle:f.get("vehicle"), registration:f.get("registration"), seats:Number(f.get("seats") || 7), approvalStatus:"pending", isOnline:false});
      await setDoc(doc(db,"users",cred.user.uid),data);
      say($("auth-message"), role === "driver" ? "Registration submitted. An administrator must verify and approve your driver account before you can receive rides." : "Account created successfully.", "success");
    } catch(err) { say($("auth-message"), friendly(err), "error"); }
  });
  $("logout")?.addEventListener("click", () => signOut(auth));
}
function friendly(err) {
  const map = {"auth/email-already-in-use":"This email already has an account.","auth/invalid-credential":"Email or password is incorrect.","auth/weak-password":"Use a password with at least 6 characters.","permission-denied":"You do not have permission to do that.","functions/failed-precondition":"Your account is not approved or the ride is not in the right state."};
  return map[err.code] || err.message || "Something went wrong. Please try again.";
}
async function getProfile(user) { const snap = await getDoc(doc(db,"users",user.uid)); return snap.exists() ? snap.data() : null; }
function showAccount(p) {
  $("auth-forms")?.classList.add("hidden"); $("account-box")?.classList.remove("hidden");
  if ($("account-name")) $("account-name").textContent = p?.name || currentUser.displayName || "Village Ride member";
  if ($("account-email")) $("account-email").textContent = currentUser.email;
}
function initPassenger() {
  wireAuth("passenger");
  const distance = document.querySelector('[name="distanceKm"]');
  const updateFare = () => { const km = Number(distance?.value || 0); $("fare").textContent = km > 0 ? money(10 + 3*km) : "R —"; };
  distance?.addEventListener("input",updateFare);
  $("ride-form")?.addEventListener("submit",async e=>{
    e.preventDefault(); if(!currentUser || profile?.role!=="passenger"){say($("ride-message"),"Please create a passenger account or log in first.","error");return;}
    const f=new FormData(e.currentTarget), km=Number(f.get("distanceKm"));
    try { const result=await callable("createRide")({pickup:f.get("pickup"),destination:f.get("destination"),distanceKm:km,paymentMethod:"cash"}); say($("ride-message"),`Ride request sent. Reference: ${result.data.rideId}`,"success"); e.currentTarget.reset(); updateFare(); }
    catch(err){say($("ride-message"),friendly(err),"error");}
  });
  onAuthStateChanged(auth,async user=>{
    cleanup(); currentUser=user; profile=user?await getProfile(user):null;
    if(user && profile?.role==="passenger"){showAccount(profile);listenPassengerRides(user.uid);}
    else { $("auth-forms")?.classList.remove("hidden");$("account-box")?.classList.add("hidden");$("passenger-rides").textContent="Log in to see your ride history."; }
  });
}
function listenPassengerRides(uid) {
  const q=query(collection(db,"rides"),where("passengerId","==",uid),orderBy("createdAt","desc"));
  unsubscribers.push(onSnapshot(q,snap=>{
    const el=$("passenger-rides"); if(!snap.size){el.innerHTML='<div class="empty-state">You have not requested any rides yet.</div>';return;}
    el.innerHTML=snap.docs.map(d=>rideCard(d.id,d.data(),"passenger")).join("");
    el.querySelectorAll("[data-cancel]").forEach(b=>b.onclick=async()=>{try{await callable("cancelRide")({rideId:b.dataset.cancel});}catch(e){say($("ride-message"),friendly(e),"error");}});
  },err=>{ $("passenger-rides").textContent=friendly(err); }));
}
function rideCard(id,r,mode) {
  const actions = [];
  if(mode==="passenger" && r.status==="requested") actions.push(`<button class="btn btn-light" data-cancel="${id}">Cancel</button>`);
  if(mode==="driver" && r.status==="requested") actions.push(`<button class="btn btn-yellow" data-accept="${id}">Accept ride</button>`);
  if(mode==="driver" && r.status==="accepted") actions.push(`<button class="btn btn-dark" data-complete="${id}">Complete ride</button>`);
  return `<article class="ride-card"><div><h3>${escapeHtml(r.pickup)} → ${escapeHtml(r.destination)}</h3><p>${escapeHtml(r.status)} · ${money(r.estimatedFare)} · ${escapeHtml(r.paymentMethod||"cash")}</p><p>${dateText(r.createdAt)} ${r.driverName ? "· Driver: "+escapeHtml(r.driverName):""}</p></div><div class="ride-actions">${actions.join("")}</div></article>`;
}
function initDriver() {
  wireAuth("driver");
  onAuthStateChanged(auth,async user=>{
    cleanup(); currentUser=user; profile=user?await getProfile(user):null;
    if(user && profile?.role==="driver"){
      showAccount(profile);
      $("driver-status").textContent=profile.approvalStatus==="approved"?"Your driver account is approved.": "Your application is pending admin approval.";
      if(profile.approvalStatus==="approved") { renderDriverControls(); listenDriverRides(); }
      else { $("driver-controls").innerHTML='<div class="empty-state">Your documents and driver details must be checked by an administrator. You cannot receive requests until approved.</div>'; $("driver-rides").textContent="Pending approval."; }
    } else { $("auth-forms")?.classList.remove("hidden");$("account-box")?.classList.add("hidden");$("driver-controls").textContent="Log in to access driver controls."; }
  });
}
function renderDriverControls() {
  $("driver-controls").innerHTML=`<div class="online-row"><div><strong>Driver availability</strong><p class="muted">Go online to receive new ride requests.</p></div><input id="online-toggle" type="checkbox" ${profile.isOnline?"checked":""} aria-label="Go online"></div><p class="notice" id="driver-action-message"></p>`;
  $("online-toggle").onchange=async e=>{try{await callable("setDriverAvailability")({isOnline:e.target.checked});profile.isOnline=e.target.checked;say($("driver-action-message"),e.target.checked?"You are online.":"You are offline.","success");}catch(err){e.target.checked=!e.target.checked;say($("driver-action-message"),friendly(err),"error");}};
}
function listenDriverRides() {
  const openQ=query(collection(db,"rides"),where("status","==","requested"),where("area","==","Mphanama"));
  const myQ=query(collection(db,"rides"),where("driverId","==",currentUser.uid),orderBy("createdAt","desc"));
  const render=()=>{};
  unsubscribers.push(onSnapshot(openQ, openSnap=>{
    getDocsSafe(myQ).then(mySnap=>{
      const open=openSnap.docs.map(d=>({id:d.id,data:d.data()}));
      const mine=mySnap.docs.map(d=>({id:d.id,data:d.data()}));
      const unique=[...open,...mine.filter(m=>!open.some(o=>o.id===m.id))];
      $("driver-rides").innerHTML=unique.length?unique.map(x=>rideCard(x.id,x.data,"driver")).join(""):'<div class="empty-state">No ride requests or active trips at the moment. Stay online to receive requests.</div>';
      $("driver-rides").querySelectorAll("[data-accept]").forEach(b=>b.onclick=async()=>{try{await callable("acceptRide")({rideId:b.dataset.accept});}catch(e){alert(friendly(e));}});
      $("driver-rides").querySelectorAll("[data-complete]").forEach(b=>b.onclick=async()=>{try{await callable("completeRide")({rideId:b.dataset.complete});}catch(e){alert(friendly(e));}});
    });
  },err=>{$("driver-rides").textContent=friendly(err);}));
}
async function getDocsSafe(q){ const {getDocs}=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"); return getDocs(q); }
function initAdmin() {
  $("admin-login-form")?.addEventListener("submit",async e=>{
    e.preventDefault();const f=new FormData(e.currentTarget);
    try{await signInWithEmailAndPassword(auth,f.get("email"),f.get("password"));}catch(err){say($("admin-message"),friendly(err),"error");}
  });
  $("admin-logout")?.addEventListener("click",()=>signOut(auth));
  onAuthStateChanged(auth,async user=>{
    cleanup();currentUser=user;
    if(!user){$("admin-dashboard").classList.add("hidden");$("admin-login-form").classList.remove("hidden");$("admin-logout").classList.add("hidden");return;}
    const token=await user.getIdTokenResult(true);
    if(token.claims.admin!==true){say($("admin-message"),"Access denied. This account does not have administrator privileges.","error");await signOut(auth);return;}
    $("admin-login-form").classList.add("hidden");$("admin-dashboard").classList.remove("hidden");$("admin-logout").classList.remove("hidden");say($("admin-message"),"Administrator authenticated.","success");listenAdmin();
  });
}
function listenAdmin() {
  unsubscribers.push(onSnapshot(query(collection(db,"users"),where("role","==","driver")),snap=>{
    $("stat-drivers").textContent=snap.size;
    $("admin-drivers").innerHTML=snap.size?snap.docs.map(d=>{const x=d.data();return `<article class="person-card"><div><h3>${escapeHtml(x.name)}</h3><p>${escapeHtml(x.email)} · ${escapeHtml(x.phone)}</p><p>${escapeHtml(x.vehicle)} · ${escapeHtml(x.registration)} · ${x.seats||"?"} seats</p><span class="small-tag">${escapeHtml(x.approvalStatus||"pending")}</span></div><div class="ride-actions">${x.approvalStatus!=="approved"?`<button class="btn btn-yellow" data-approve="${d.id}">Approve</button>`:"<span class='small-tag'>Approved</span>"}</div></article>`}).join(""):'<div class="empty-state">No driver applications yet.</div>';
    $("admin-drivers").querySelectorAll("[data-approve]").forEach(b=>b.onclick=async()=>{try{await callable("approveDriver")({driverId:b.dataset.approve});}catch(e){alert(friendly(e));}});
  }));
  unsubscribers.push(onSnapshot(query(collection(db,"rides"),orderBy("createdAt","desc")),snap=>{
    $("stat-rides").textContent=snap.size;$("stat-open").textContent=snap.docs.filter(d=>d.data().status==="requested").length;
    $("admin-rides").innerHTML=snap.size?snap.docs.map(d=>rideCard(d.id,d.data(),"admin")).join(""):'<div class="empty-state">No rides have been requested.</div>';
  }));
}
