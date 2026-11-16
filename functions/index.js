const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const crypto = require("crypto");
initializeApp();
const db = getFirestore();

async function userContext(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in.");
  const uid = request.auth.uid;
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "Account profile not found.");
  return { uid, user: snap.data(), ref: snap.ref };
}
async function adminOnly(request) {
  if (!request.auth || request.auth.token.admin !== true) throw new HttpsError("permission-denied", "Administrator access required.");
}
function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 160) throw new HttpsError("invalid-argument", `Enter a valid ${label}.`);
  return value.trim();
}
exports.createRide = onCall(async request => {
  const {uid,user}=await userContext(request);
  if (user.role !== "passenger") throw new HttpsError("permission-denied", "Passenger account required.");
  const pickup=requiredText(request.data.pickup,"pickup location");
  const destination=requiredText(request.data.destination,"destination");
  const km=Number(request.data.distanceKm);
  if (!Number.isFinite(km) || km < 1 || km > 150) throw new HttpsError("invalid-argument","Distance must be between 1 and 150 km.");
  const fare=Math.round((10+3*km)*100)/100;
  const id=crypto.randomUUID();
  await db.collection("rides").doc(id).create({
    passengerId:uid, passengerName:user.name || "", passengerPhone:user.phone || "",
    driverId:null, driverName:null, pickup, destination, distanceKm:km,
    estimatedFare:fare, paymentMethod:"cash", area:"Mphanama",
    status:"requested", createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()
  });
  return {rideId:id, estimatedFare:fare};
});
exports.setDriverAvailability = onCall(async request => {
  const {user,ref}=await userContext(request);
  if(user.role!=="driver" || user.approvalStatus!=="approved") throw new HttpsError("permission-denied","Only approved drivers can go online.");
  if(typeof request.data.isOnline!=="boolean") throw new HttpsError("invalid-argument","Availability value is invalid.");
  await ref.update({isOnline:request.data.isOnline});
  return {isOnline:request.data.isOnline};
});
exports.acceptRide = onCall(async request => {
  const {uid,user}=await userContext(request);
  if(user.role!=="driver" || user.approvalStatus!=="approved" || user.isOnline!==true) throw new HttpsError("permission-denied","You must be an approved, online driver.");
  const rideRef=db.collection("rides").doc(requiredText(request.data.rideId,"ride ID"));
  await db.runTransaction(async tx=>{
    const snap=await tx.get(rideRef);
    if(!snap.exists || snap.data().status!=="requested") throw new HttpsError("failed-precondition","This ride is no longer available.");
    tx.update(rideRef,{driverId:uid,driverName:user.name || "",status:"accepted",acceptedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  });
  return {ok:true};
});
exports.completeRide = onCall(async request => {
  const {uid,user}=await userContext(request);
  const rideRef=db.collection("rides").doc(requiredText(request.data.rideId,"ride ID"));
  await db.runTransaction(async tx=>{
    const snap=await tx.get(rideRef);
    if(!snap.exists || snap.data().driverId!==uid || snap.data().status!=="accepted") throw new HttpsError("failed-precondition","You cannot complete this ride.");
    tx.update(rideRef,{status:"completed",completedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  });
  return {ok:true};
});
exports.cancelRide = onCall(async request => {
  const {uid}=await userContext(request);
  const rideRef=db.collection("rides").doc(requiredText(request.data.rideId,"ride ID"));
  await db.runTransaction(async tx=>{
    const snap=await tx.get(rideRef);
    if(!snap.exists || snap.data().passengerId!==uid || snap.data().status!=="requested") throw new HttpsError("failed-precondition","Only your unaccepted ride can be cancelled.");
    tx.update(rideRef,{status:"cancelled",updatedAt:FieldValue.serverTimestamp()});
  });
  return {ok:true};
});
exports.approveDriver = onCall(async request => {
  await adminOnly(request);
  const driverId=requiredText(request.data.driverId,"driver ID");
  const ref=db.collection("users").doc(driverId);
  const snap=await ref.get();
  if(!snap.exists || snap.data().role!=="driver") throw new HttpsError("not-found","Driver application not found.");
  await ref.update({approvalStatus:"approved",approvedAt:FieldValue.serverTimestamp(),isOnline:false});
  return {ok:true};
});
// One-time admin bootstrap: run the separate set-admin.js script using a trusted service account.
// Never expose a service-account key in the website or commit it to GitHub.
