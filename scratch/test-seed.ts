import { initializeApp } from "firebase/app";
import { getFirestore, setDoc, doc, collection, addDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAbKSnlJYRvN92M27w2YxxmKM5Lb4GNW_4",
  authDomain: "spin-the-wheel-73334.firebaseapp.com",
  projectId: "spin-the-wheel-73334",
  storageBucket: "spin-the-wheel-73334.firebasestorage.app",
  messagingSenderId: "26354709669",
  appId: "1:26354709669:web:af2b416e461b798954c94c",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runSeed() {
  console.log("Seeding to Firebase project:", firebaseConfig.projectId);
  try {
    const ref = doc(db, "campaigns", "demo-campaign");
    await setDoc(ref, {
      id: "demo-campaign",
      name: "Dettol Hygiene Challenge",
      subTitle: "DETTOL NIGERIA",
      primaryColor: "#00BFA6",
      secondaryColor: "#FF6B35",
      backgroundColor: "#0D1B2A",
      gradientStart: "#00BFA6",
      gradientEnd: "#0D1B2A",
      welcomeMessage: "Spin the Dettol wheel for instant prizes!",
      oneSpinPerPhone: true,
      active: true,
      adminPin: "1234",
      prizes: [
        { id: "sanitizer", label: "Dettol Sanitizer Pack", color: "#00BFA6", weight: 25, quantity: 50, claimedCount: 1 },
        { id: "tshirt", label: "Branded Polo T-shirt", color: "#FF6B35", weight: 15, quantity: 15, claimedCount: 1 },
        { id: "try-again", label: "Try Again", color: "#1E293B", weight: 25, isLosing: true },
      ],
      stores: [
        { id: "store-1", name: "Shoprite Ikeja City Mall", code: "shoprite-ikeja", pin: "1234", city: "Lagos" },
        { id: "store-2", name: "SPAR Mall Lekki", code: "spar-lekki", pin: "1234", city: "Lagos" },
      ],
    }, { merge: true });
    console.log("Successfully seeded demo-campaign!");

    await addDoc(collection(db, "participants"), {
      name: "Akin Omisakin",
      phone: "08012345678",
      campaignId: "demo-campaign",
      prizeId: "sanitizer",
      prizeLabel: "Dettol Sanitizer Pack",
      voucherCode: "DETTOL-AK89X1",
      won: true,
      createdAt: Date.now(),
      storeCode: "shoprite-ikeja",
      storeName: "Shoprite Ikeja City Mall",
    });
    console.log("Successfully seeded sample participant winner!");
  } catch (err) {
    console.error("Seeding Error:", err);
  }
}

runSeed();
