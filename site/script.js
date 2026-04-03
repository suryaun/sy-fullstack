const CONTACT = {
  instagramUrl: "https://www.instagram.com/seere_yaana?igsh=NXV1eXZpZ3FuaGpk",
  whatsappDisplay: "+91 9187668643",
  whatsappNumber: "919187668643",
  whatsappMessage: "Hi Seere Yaana, I would like to know more about your collection.",
  email: "seereyaana@gmail.com",
  shopUrl: "https://shop.seereyaana.com"
};

function wireContacts() {
  const whatsappHref = `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(CONTACT.whatsappMessage)}`;
  const emailHref = `mailto:${CONTACT.email}?subject=${encodeURIComponent("Seere Yaana Enquiry")}`;

  const instagram = document.querySelectorAll("#instagram-link, #instagram-link-secondary");
  instagram.forEach((el) => {
    el.setAttribute("href", CONTACT.instagramUrl);
  });

  const whatsapp = document.querySelectorAll("#whatsapp-link, #whatsapp-link-secondary");
  whatsapp.forEach((el) => {
    el.setAttribute("href", whatsappHref);
  });

  const email = document.getElementById("email-link");
  if (email) {
    email.setAttribute("href", emailHref);
  }

  const shop = document.getElementById("shop-link");
  if (shop) {
    shop.setAttribute("href", CONTACT.shopUrl);
  }

  const emailText = document.getElementById("contact-email-text");
  if (emailText) {
    emailText.textContent = CONTACT.email;
  }

  const whatsappText = document.getElementById("contact-whatsapp-text");
  if (whatsappText) {
    whatsappText.textContent = CONTACT.whatsappDisplay;
  }

  const year = document.getElementById("year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
}

function startRevealAnimation() {
  const items = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("show");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 }
  );

  items.forEach((item, idx) => {
    item.style.animationDelay = `${idx * 70}ms`;
    observer.observe(item);
  });
}

function wireImageFade() {
  const images = document.querySelectorAll("img.fade-image");
  images.forEach((image) => {
    const markLoaded = () => {
      image.classList.add("loaded");
    };

    if (image.complete) {
      markLoaded();
      return;
    }

    image.addEventListener("load", markLoaded, { once: true });
    image.addEventListener("error", markLoaded, { once: true });
  });
}

function wireSystemThemePreference() {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const applyTheme = (isDark) => {
    document.body.setAttribute("data-theme", isDark ? "festive" : "light");
  };

  applyTheme(mediaQuery.matches);

  mediaQuery.addEventListener("change", (event) => {
    applyTheme(event.matches);
  });
}

wireContacts();
startRevealAnimation();
wireImageFade();
wireSystemThemePreference();
