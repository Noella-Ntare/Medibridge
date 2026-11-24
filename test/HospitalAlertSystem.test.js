const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const Category = { Blood: 0, Medication: 1, PatientTransfer: 2 };
const Urgency  = { Normal: 0, Urgent: 1, Critical: 2 };
const Status   = { None: 0, Open: 1, Responded: 2, Fulfilled: 3, Cancelled: 4 };

async function deployFixture() {
  const [admin, chuk, kimironko, outsider] = await ethers.getSigners();
  const c = await (await ethers.getContractFactory("HospitalAlertSystem")).deploy();
  await c.registerHospital(chuk.address, "CHUK Referral Hospital");
  await c.registerHospital(kimironko.address, "Kimironko District Hospital");
  return { c, admin, chuk, kimironko, outsider };
}
async function withAlertFixture() {
  const f = await deployFixture();
  await f.c.connect(f.kimironko).raiseAlert(Category.Blood, Urgency.Critical, "O-negative blood, 4 units");
  return f;
}

describe("HospitalAlertSystem (MediBridge)", function () {
  describe("TC1-3: Setup & hospital registry", function () {
    it("TC1: deployer is admin and the contract starts empty", async function () {
      const { c, admin } = await loadFixture(deployFixture);
      expect(await c.hasRole(await c.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await c.totalAlerts()).to.equal(0);
    });
    it("TC2: admin registers and removes hospitals; name is stored", async function () {
      const { c, chuk } = await loadFixture(deployFixture);
      expect(await c.hospitalName(chuk.address)).to.equal("CHUK Referral Hospital");
      await expect(c.removeHospital(chuk.address)).to.emit(c, "HospitalRemoved").withArgs(chuk.address);
      expect(await c.hasRole(await c.HOSPITAL_ROLE(), chuk.address)).to.equal(false);
    });
    it("TC3: only the admin can register hospitals", async function () {
      const { c, outsider } = await loadFixture(deployFixture);
      await expect(c.connect(outsider).registerHospital(outsider.address, "Fake"))
        .to.be.revertedWithCustomError(c, "AccessControlUnauthorizedAccount");
    });
  });

  describe("TC4-7: Raising alerts", function () {
    it("TC4: a registered hospital raises a blood alert; record and event are correct", async function () {
      const { c, kimironko } = await loadFixture(deployFixture);
      await expect(c.connect(kimironko).raiseAlert(Category.Blood, Urgency.Critical, "O-negative blood, 4 units"))
        .to.emit(c, "AlertRaised").withArgs(1, Category.Blood, Urgency.Critical, "O-negative blood, 4 units", kimironko.address);
      const a = await c.getAlert(1);
      expect(a.status).to.equal(Status.Open);
      expect(a.requester).to.equal(kimironko.address);
      expect(await c.openAlertCount()).to.equal(1);
    });
    it("TC5: an unregistered address cannot raise an alert", async function () {
      const { c, outsider } = await loadFixture(deployFixture);
      await expect(c.connect(outsider).raiseAlert(Category.Blood, Urgency.Normal, "x"))
        .to.be.revertedWithCustomError(c, "AccessControlUnauthorizedAccount");
    });
    it("TC6: an empty item description is rejected", async function () {
      const { c, chuk } = await loadFixture(deployFixture);
      await expect(c.connect(chuk).raiseAlert(Category.Medication, Urgency.Urgent, ""))
        .to.be.revertedWith("Item description required");
    });
    it("TC7: all three categories work and ids increase by one", async function () {
      const { c, chuk } = await loadFixture(deployFixture);
      await c.connect(chuk).raiseAlert(Category.Blood, Urgency.Urgent, "A+ blood, 2 units");
      await c.connect(chuk).raiseAlert(Category.Medication, Urgency.Normal, "Insulin, 20 vials");
      await c.connect(chuk).raiseAlert(Category.PatientTransfer, Urgency.Critical, "Adult ICU bed with ventilator");
      expect(await c.totalAlerts()).to.equal(3);
      expect((await c.getAlert(3)).category).to.equal(Category.PatientTransfer);
    });
  });

  describe("TC8-12: Responding to alerts", function () {
    it("TC8: another hospital responds and the response time is recorded", async function () {
      const { c, chuk } = await loadFixture(withAlertFixture);
      await time.increase(90);
      await expect(c.connect(chuk).respondToAlert(1, "4 units available")).to.emit(c, "AlertResponded");
      const a = await c.getAlert(1);
      expect(a.status).to.equal(Status.Responded);
      expect(a.responder).to.equal(chuk.address);
      expect(a.respondedAt - a.requestedAt).to.be.gte(90n);
      expect(a.responseNote).to.equal("4 units available");
    });
    it("TC9: a hospital cannot respond to its own alert", async function () {
      const { c, kimironko } = await loadFixture(withAlertFixture);
      await expect(c.connect(kimironko).respondToAlert(1, "me")).to.be.revertedWith("Cannot respond to your own alert");
    });
    it("TC10: an unregistered address cannot respond", async function () {
      const { c, outsider } = await loadFixture(withAlertFixture);
      await expect(c.connect(outsider).respondToAlert(1, "x")).to.be.revertedWithCustomError(c, "AccessControlUnauthorizedAccount");
    });
    it("TC11: an alert that already has a response cannot be answered again", async function () {
      const { c, chuk, admin } = await loadFixture(withAlertFixture);
      await c.registerHospital(admin.address, "Third Hospital");
      await c.connect(chuk).respondToAlert(1, "first");
      await expect(c.connect(admin).respondToAlert(1, "second")).to.be.revertedWith("Alert is not open");
    });
    it("TC12: responding to a non-existent alert reverts", async function () {
      const { c, chuk } = await loadFixture(withAlertFixture);
      await expect(c.connect(chuk).respondToAlert(0, "x")).to.be.revertedWith("Alert not found");
      await expect(c.connect(chuk).respondToAlert(99, "x")).to.be.revertedWith("Alert not found");
    });
  });

  describe("TC13-17: Closing alerts", function () {
    it("TC13: the requester fulfils an alert after a response; counters update", async function () {
      const { c, chuk, kimironko } = await loadFixture(withAlertFixture);
      await c.connect(chuk).respondToAlert(1, "ok");
      await expect(c.connect(kimironko).fulfilAlert(1)).to.emit(c, "AlertFulfilled");
      expect((await c.getAlert(1)).status).to.equal(Status.Fulfilled);
      expect(await c.openAlertCount()).to.equal(0);
    });
    it("TC14: an alert cannot be fulfilled before a response, or by someone other than the requester", async function () {
      const { c, chuk, kimironko } = await loadFixture(withAlertFixture);
      await expect(c.connect(kimironko).fulfilAlert(1)).to.be.revertedWith("Needs a response first");
      await c.connect(chuk).respondToAlert(1, "ok");
      await expect(c.connect(chuk).fulfilAlert(1)).to.be.revertedWith("Only the requester can close");
    });
    it("TC15: the requester can cancel an open alert", async function () {
      const { c, kimironko } = await loadFixture(withAlertFixture);
      await expect(c.connect(kimironko).cancelAlert(1)).to.emit(c, "AlertCancelled").withArgs(1);
      expect((await c.getAlert(1)).status).to.equal(Status.Cancelled);
      expect(await c.openAlertCount()).to.equal(0);
    });
    it("TC16: only the requester can cancel, and a closed alert cannot be cancelled again", async function () {
      const { c, chuk, kimironko } = await loadFixture(withAlertFixture);
      await expect(c.connect(chuk).cancelAlert(1)).to.be.revertedWith("Only the requester can close");
      await c.connect(kimironko).cancelAlert(1);
      await expect(c.connect(kimironko).cancelAlert(1)).to.be.revertedWith("Alert already closed");
    });
    it("TC17: getOpenAlertIds excludes fulfilled and cancelled alerts", async function () {
      const { c, chuk, kimironko } = await loadFixture(withAlertFixture);
      await c.connect(kimironko).raiseAlert(Category.Medication, Urgency.Urgent, "Oxytocin, 50 ampoules");
      await c.connect(kimironko).raiseAlert(Category.PatientTransfer, Urgency.Critical, "Neonatal ICU transfer");
      await c.connect(kimironko).cancelAlert(2);
      await c.connect(chuk).respondToAlert(1, "ok");
      await c.connect(kimironko).fulfilAlert(1);
      expect((await c.getOpenAlertIds()).map(Number)).to.deep.equal([3]);
    });
  });

  describe("TC18: Access removal", function () {
    it("TC18: a removed hospital can no longer raise alerts, but its old alerts stay on record", async function () {
      const { c, kimironko } = await loadFixture(withAlertFixture);
      await c.removeHospital(kimironko.address);
      await expect(c.connect(kimironko).raiseAlert(Category.Blood, Urgency.Normal, "x"))
        .to.be.revertedWithCustomError(c, "AccessControlUnauthorizedAccount");
      expect((await c.getAlert(1)).requester).to.equal(kimironko.address);
    });
  });
});
